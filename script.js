(() => {
"use strict";
const KEY="juro_complete_v2";
const $=s=>document.querySelector(s);
const EMOJIS=["😀","😂","🥰","😍","😎","😭","😮","😡","👍","👎","❤️","🔥","🎉","🙏","👏","💯","🤔","✨"];
const REACTIONS=["❤️","😂","👍","😮","😢","🔥"];
const supabaseConfig=window.JURO_SUPABASE_CONFIG||{};
const onlineMode=Boolean(supabaseConfig.url&&supabaseConfig.anonKey);
let supabaseClient=null,supabaseInitError=null,currentUser=null,activeMessagesChannel=null,activeChatListChannel=null;
if(onlineMode){
 try{
  if(!window.supabase?.createClient)throw new Error("Supabase client library did not load.");
  supabaseClient=window.supabase.createClient(supabaseConfig.url,supabaseConfig.anonKey);
 }catch(error){supabaseInitError=error;console.error("Could not initialize Supabase.",error)}
}
const makeId=()=>Date.now()+"-"+Math.random().toString(16).slice(2);
const now=()=>Date.now();
const seed=()=>[
{id:makeId(),name:"JURO Support",phone:"",unread:1,messages:[{id:makeId(),text:"Welcome to JURO! 👋",sent:false,time:now()-60000,reactions:[]},{id:makeId(),text:"Explore Chats, Status, Calls, People and Settings.",sent:false,time:now()-30000,reactions:[]}]},
{id:makeId(),name:"Basit Ali",phone:"",unread:0,messages:[{id:makeId(),text:"Hello! Welcome to JURO 😊",sent:false,time:now()-3600000,reactions:[]}]},
{id:makeId(),name:"Noor",phone:"",unread:0,messages:[{id:makeId(),text:"How are you?",sent:false,time:now()-86400000,reactions:[]}]}];
let data;
if(!onlineMode){try{data=JSON.parse(localStorage.getItem(KEY)||"null")}catch{data=null}}
if(onlineMode)data={chats:[],statuses:[],calls:[],groups:[],profile:"JURO User",dark:false};
else if(!data||!Array.isArray(data.chats))data={chats:seed(),statuses:[],calls:[],profile:"JURO User",dark:false};
data.statuses=data.statuses||[];data.calls=data.calls||[];data.groups=data.groups||[];data.profile=data.profile||"JURO User";
data.chats.forEach(chat=>chat.messages.forEach(message=>{
 if(Array.isArray(message.reactions)&&message.reactions.length>1)message.reactions=[message.reactions[message.reactions.length-1]];
}));
let recording=null, recordingChunks=[],installPrompt=null;
let activeId=null,filter="all",contactMode="chat",toastTimer;
const save=()=>{if(onlineMode)return true;try{localStorage.setItem(KEY,JSON.stringify(data));return true}catch{toast("Browser storage is full; changes may not be saved.");return false}};
const initials=s=>s.trim().split(/\s+/).slice(0,2).map(x=>x[0]||"").join("").toUpperCase();
const fmt=t=>new Intl.DateTimeFormat([],{hour:"2-digit",minute:"2-digit"}).format(new Date(t||now()));
const last=c=>c.messages[c.messages.length-1];
function toast(s){const t=$("#toast");t.textContent=s;t.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove("show"),2400)}
const normalizePhone=phone=>phone.trim().replace(/[\s()-]/g,"");
const validPhone=phone=>/^\+[1-9]\d{7,14}$/.test(phone);
function remoteMessage(row){
 return{id:row.id,text:row.body,sent:row.sender_id===currentUser?.id,time:Date.parse(row.created_at),reactions:[]};
}
function appendRemoteMessage(row){
 const chat=data.chats.find(item=>item.id===row.chat_id);
 if(!chat||chat.messages.some(message=>message.id===row.id))return;
 chat.messages.push(remoteMessage(row));chat.messages.sort((a,b)=>a.time-b.time);
 if(activeId===row.chat_id)renderMessages();renderChats();
}
async function loadRemoteMessages(chatId){
 if(!supabaseClient||!currentUser)return;
 try{
  const chat=data.chats.find(item=>item.id===chatId);if(!chat)return;
  chat.messages=[];
  const {data:rows,error}=await supabaseClient.from("messages")
   .select("id,chat_id,sender_id,body,created_at")
   .eq("chat_id",chatId).order("created_at",{ascending:true}).limit(500);
  if(error){
   toast("Could not load messages: "+error.message);
   if(activeId===chatId){const area=$("#messages");area.replaceChildren();const notice=document.createElement("div");notice.className="empty";notice.textContent="Could not load messages. Check your connection and reopen this chat.";area.append(notice)}
   return;
  }
  if(activeId!==chatId)return;
  const liveMessages=chat.messages;
  chat.messages=(rows||[]).map(remoteMessage);
  liveMessages.forEach(message=>{if(!chat.messages.some(item=>item.id===message.id))chat.messages.push(message)});
  chat.messages.sort((a,b)=>a.time-b.time);
  renderMessages();renderChats();
 }catch(error){
  console.error("Could not load remote messages.",error);toast("Could not load messages. Check your connection.");
  if(activeId===chatId){const area=$("#messages");area.replaceChildren();const notice=document.createElement("div");notice.className="empty";notice.textContent="Could not load messages. Check your connection and reopen this chat.";area.append(notice)}
 }
}
async function loadRemoteChats(){
 if(!supabaseClient||!currentUser)return;
 try{
  const previousMessages=new Map(data.chats.map(chat=>[chat.id,chat.messages]));
  const {data:memberships,error:membershipError}=await supabaseClient.from("chat_members").select("chat_id").eq("user_id",currentUser.id);
  if(membershipError){toast("Could not load your chats: "+membershipError.message);return}
  const ids=(memberships||[]).map(item=>item.chat_id);
  if(!ids.length){data.chats=[];renderChats();renderPeople();renderGroups();return}
  const {data:chats,error:chatError}=await supabaseClient.from("chats")
   .select("id,is_group,title,created_at,chat_members(user_id,profiles(id,phone,display_name))")
   .in("id",ids).order("created_at",{ascending:false});
  if(chatError){toast("Could not load your chats: "+chatError.message);return}
  const {data:recent,error:messageError}=await supabaseClient.from("messages")
   .select("id,chat_id,sender_id,body,created_at")
   .in("chat_id",ids).order("created_at",{ascending:false}).limit(500);
  if(messageError){toast("Could not load recent messages: "+messageError.message);return}
  const lastByChat=new Map();
  (recent||[]).forEach(message=>{if(!lastByChat.has(message.chat_id))lastByChat.set(message.chat_id,message)});
  data.chats=(chats||[]).map(chat=>{
   const members=(chat.chat_members||[]).map(member=>Array.isArray(member.profiles)?member.profiles[0]:member.profiles).filter(Boolean);
   const peers=members.filter(profile=>profile.id!==currentUser.id);
   const latest=lastByChat.get(chat.id),oldMessages=previousMessages.get(chat.id);
   return{
    id:chat.id,name:chat.is_group?chat.title:(peers[0]?.display_name||peers[0]?.phone||"JURO chat"),
    phone:chat.is_group?"":(peers[0]?.phone||""),isGroup:chat.is_group,
    members,messages:oldMessages?.length?oldMessages:(latest?[remoteMessage(latest)]:[]),unread:0
   };
  });
  renderChats();renderPeople();renderGroups();
 }catch(error){console.error("Could not load remote chats.",error);toast("Could not load chats. Check your connection.")}
}
function subscribeToChatList(){
 if(!supabaseClient||!currentUser)return;
 if(activeChatListChannel)supabaseClient.removeChannel(activeChatListChannel).catch(error=>console.error("Could not close the chat-list subscription.",error));
 activeChatListChannel=supabaseClient.channel("juro-chat-list-"+currentUser.id)
  .on("postgres_changes",{event:"INSERT",schema:"public",table:"chat_members",filter:"user_id=eq."+currentUser.id},()=>loadRemoteChats())
  .subscribe(status=>{if(status==="CHANNEL_ERROR"||status==="TIMED_OUT")toast("Live chat-list updates are unavailable.")});
}
function subscribeToMessages(){
 if(!supabaseClient||!currentUser)return;
 if(activeMessagesChannel)supabaseClient.removeChannel(activeMessagesChannel).catch(error=>console.error("Could not close the message subscription.",error));
 activeMessagesChannel=supabaseClient.channel("juro-messages-"+currentUser.id)
  .on("postgres_changes",{event:"INSERT",schema:"public",table:"messages"},payload=>appendRemoteMessage(payload.new))
  .subscribe(status=>{if(status==="CHANNEL_ERROR"||status==="TIMED_OUT")toast("Live message updates are unavailable.")});
}
function renderChats(){
 const q=$("#searchInput").value.trim().toLowerCase(),list=$("#chatList");list.replaceChildren();
 const chats=data.chats.filter(c=>(filter==="all"||c.unread>0)&&(`${c.name} ${c.phone} ${last(c)?.text||""}`).toLowerCase().includes(q)).sort((a,b)=>(last(b)?.time||0)-(last(a)?.time||0));
 $("#chatCount").textContent=data.chats.length||"";
 if(!chats.length){const e=document.createElement("div");e.className="empty";e.textContent="No conversations found.";list.append(e);return}
 chats.forEach(c=>{
  const b=document.createElement("button");b.className="chat-item"+(activeId===c.id?" selected":"");b.type="button";b.onclick=()=>openChat(c.id);
  const av=document.createElement("div");av.className="avatar";av.textContent=initials(c.name);
  const info=document.createElement("div");info.className="chat-info";
  const top=document.createElement("div");top.className="chat-top";
  const name=document.createElement("span");name.className="chat-name";name.textContent=c.name;
  const time=document.createElement("span");time.className="chat-time";time.textContent=last(c)?fmt(last(c).time):"";
  const bottom=document.createElement("div");bottom.className="chat-bottom";
  const preview=document.createElement("div");preview.className="chat-preview";preview.textContent=last(c)?(last(c).sent?"You: ":"")+last(c).text:"No messages yet";
  top.append(name,time);bottom.append(preview);
  if(c.unread){const badge=document.createElement("span");badge.className="unread";badge.textContent=c.unread;bottom.append(badge)}
  info.append(top,bottom);b.append(av,info);list.append(b);
 });
}
function switchPage(page){
 activeId=null;$("#app").classList.remove("mobile-page-open");
 document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
 document.querySelectorAll(".page").forEach(p=>p.hidden=true);$("#chatView").hidden=true;
 const target=page==="chats"?$("#welcomePage"):$("#"+page+"Page");if(target)target.hidden=false;
 $("#chatSidebar").hidden=page!=="chats";
 if(page!=="chats")$("#app").classList.add("mobile-page-open");
 if(page==="status")renderStatuses();if(page==="calls")renderCalls();if(page==="people")renderPeople();if(page==="groups")renderGroups();renderChats();
}
function openChat(id){
 const c=data.chats.find(x=>x.id===id);if(!c)return;
 activeId=id;c.unread=0;if(!onlineMode)save();$("#chatSidebar").hidden=true;
 document.querySelectorAll(".page").forEach(p=>p.hidden=true);$("#chatView").hidden=false;
 $("#app").classList.add("mobile-page-open");
 document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.page==="chats"));
 $("#activeAvatar").textContent=initials(c.name);$("#activeName").textContent=c.name;$("#activePhone").textContent=c.isGroup?`${(c.members||[]).length} members · Group`:(c.phone||"JURO conversation");
 renderChats();
 if(onlineMode){
  const area=$("#messages");area.replaceChildren();const loading=document.createElement("div");loading.className="empty";loading.textContent="Loading messages…";area.append(loading);
  loadRemoteMessages(id);
 }else renderMessages();
}
function renderMessages(){
 const c=data.chats.find(x=>x.id===activeId),area=$("#messages");if(!c)return;area.replaceChildren();
 if(!c.messages.length){const e=document.createElement("div");e.className="empty";e.textContent="This is the beginning of your conversation.";area.append(e);return}
 const label=document.createElement("div");label.className="date-label";label.textContent="Conversation";area.append(label);
 c.messages.forEach(m=>{
  const bubble=document.createElement("article");bubble.className="bubble "+(m.sent?"sent":"received");
  const txt=document.createElement("div");txt.textContent=m.text;
  const tm=document.createElement("div");tm.className="msg-time";tm.textContent=fmt(m.time);bubble.append(txt,tm);
  if(m.reactions?.length){const r=document.createElement("div");r.className="reaction-display";r.textContent=[...new Set(m.reactions)].join(" ");bubble.append(r)}
  if(!onlineMode){
   const actions=document.createElement("div");actions.className="message-actions";
   const react=document.createElement("button");react.className="tiny-btn";react.type="button";react.textContent="☺ React";react.onclick=()=>{
    const old=bubble.querySelector(".reaction-picker");if(old){old.remove();return}
    const picker=document.createElement("div");picker.className="reaction-picker";
    REACTIONS.forEach(emoji=>{const x=document.createElement("button");x.type="button";x.textContent=emoji;x.onclick=()=>{m.reactions=[emoji];save();renderMessages()};picker.append(x)});bubble.append(picker);
   };
   const del=document.createElement("button");del.className="tiny-btn danger-text";del.type="button";del.textContent="🗑 Delete";del.onclick=()=>{
    if(!confirm("Delete this message?"))return;c.messages=c.messages.filter(x=>x.id!==m.id);const saved=save();renderMessages();renderChats();if(saved)toast("Message deleted.");
   };
   actions.append(react,del);bubble.append(actions);
  }
  area.append(bubble);
 });area.scrollTop=area.scrollHeight;
}
function newContact(mode="chat"){
 contactMode=mode;$("#modalTitle").textContent=onlineMode?"New chat":mode==="person"?"Add a person":"New conversation";
 $("#personNameLabel").hidden=onlineMode;$("#personName").hidden=onlineMode;
 $("#personPhoneLabel").textContent=onlineMode?"Phone number (+ country code)":"Phone (optional)";
 $("#personName").required=!onlineMode;$("#personPhone").required=onlineMode;$("#modalBg").hidden=false;$("#modalError").textContent="";$("#personName").value="";$("#personPhone").value="";
 (onlineMode?$("#personPhone"):$("#personName")).focus();
}
function closeContact(){$("#modalBg").hidden=true}
async function saveContact(e){
 e.preventDefault();const name=$("#personName").value.trim(),phone=$("#personPhone").value.trim();
 if(onlineMode){
  const normalizedPhone=normalizePhone(phone);
  if(!validPhone(normalizedPhone)){$("#modalError").textContent="Enter a phone number in international format, for example +923112345678.";return}
  if(!supabaseClient||!currentUser){$("#modalError").textContent="Sign in before starting a chat.";return}
  let result;
  try{result=await supabaseClient.rpc("create_direct_chat",{p_phone:normalizedPhone})}
  catch(error){$("#modalError").textContent="Could not start chat: "+error.message;return}
  const {data:chatId,error}=result;
  if(error){$("#modalError").textContent=error.message;return}
  closeContact();await loadRemoteChats();openChat(chatId);toast("Chat opened.");return;
 }
 if(!name){$("#modalError").textContent="Please enter a name.";return}
 let c=data.chats.find(x=>x.name.toLowerCase()===name.toLowerCase());
 if(!c){c={id:makeId(),name,phone,unread:0,messages:[]};data.chats.unshift(c)}else if(phone&&!c.phone)c.phone=phone;
 const saved=save();closeContact();renderChats();if(contactMode==="chat")openChat(c.id);else renderPeople();if(saved)toast("Contact saved.");
}
async function send(e){
 e.preventDefault();const input=$("#messageInput"),text=input.value.trim(),c=data.chats.find(x=>x.id===activeId);if(!text||!c)return;
 if(onlineMode){
  if(!supabaseClient||!currentUser){toast("Sign in to send messages.");return}
  let result;
  try{result=await supabaseClient.from("messages").insert({chat_id:c.id,sender_id:currentUser.id,body:text}).select("id,chat_id,sender_id,body,created_at").single()}
  catch(error){toast("Message not sent: "+error.message);return}
  const {data:message,error}=result;
  if(error){toast("Message not sent: "+error.message);return}
  input.value="";appendRemoteMessage(message);return;
 }
 c.messages.push({id:makeId(),text,sent:true,time:now(),reactions:[]});input.value="";save();renderMessages();renderChats();
}
async function createGroup(){
 if(onlineMode){
  const name=prompt("Group name:");if(!name||!name.trim())return;
  const raw=prompt("Enter member phone numbers in international format, separated by commas:");
  if(raw===null)return;
  const phones=raw.split(/[,\n]+/).map(normalizePhone).filter(Boolean);
  if(!phones.length||phones.some(phone=>!validPhone(phone))){toast("Enter valid international phone numbers, for example +923112345678.");return}
  if(!supabaseClient){toast("Supabase is not configured.");return}
  let result;
  try{result=await supabaseClient.rpc("create_group_chat",{p_title:name.trim().slice(0,60),p_phones:phones})}
  catch(error){toast("Could not create group: "+error.message);return}
  const {data:chatId,error}=result;
  if(error){toast("Could not create group: "+error.message);return}
  await loadRemoteChats();openChat(chatId);toast("Group created.");return;
 }
 const name=prompt("Group name:");
 if(!name||!name.trim())return;
 const choices=data.chats.filter(x=>!x.isGroup).map((x,i)=>`${i+1}. ${x.name}`).join("\n");
 if(!choices){toast("Add contacts first to create a group.");return}
 const raw=prompt("Enter member numbers separated by commas:\n"+choices);
 if(raw===null)return;
 const ids=raw.split(",").map(x=>parseInt(x.trim(),10)-1).filter(i=>Number.isInteger(i)&&i>=0&&i<data.chats.filter(x=>!x.isGroup).length);
 const people=data.chats.filter(x=>!x.isGroup);
 const members=[...new Set(ids.map(i=>people[i].id))];
 if(!members.length){toast("Choose at least one valid member.");return}
 const g={id:makeId(),name:name.trim().slice(0,60),phone:"",unread:0,messages:[],isGroup:true,members};
 data.chats.unshift(g);data.groups.push(g.id);const saved=save();renderChats();renderGroups();openChat(g.id);if(saved)toast("Group created on this browser.");
}
function renderGroups(){
 const list=$("#groupsList");if(!list)return;list.replaceChildren();
 const groups=data.chats.filter(c=>c.isGroup);
 if(!groups.length){const e=document.createElement("div");e.className="empty";e.textContent="No groups yet. Create your first group.";list.append(e);return}
 groups.forEach(g=>{const row=document.createElement("div");row.className="person-item";const av=document.createElement("div");av.className="avatar";av.textContent="👥";const meta=document.createElement("div");meta.className="person-meta";const b=document.createElement("b");b.textContent=g.name;const p=document.createElement("p");p.textContent=(g.members||[]).length+" members";meta.append(b,p);const open=document.createElement("button");open.className="secondary-btn";open.textContent="Open group";open.onclick=()=>openChat(g.id);row.append(av,meta,open);list.append(row)});
}
function viewProfile(){
 const c=data.chats.find(x=>x.id===activeId);if(!c)return;
 $("#profileAvatar").textContent=initials(c.name);$("#profileViewName").textContent=c.name;
 $("#profileViewPhone").textContent=c.isGroup?`Group · ${(c.members||[]).length} members`:(c.phone||"No phone number added");
 $("#profileModal").hidden=false;
}
function attachFile(file){
 if(!file)return;
 const max=2*1024*1024*1024;
 if(file.size>max){toast("File is larger than 2GB.");return}
 const c=data.chats.find(x=>x.id===activeId);if(!c)return;
 const size=file.size>=1024**3?(file.size/1024**3).toFixed(2)+" GB":(file.size/1024**2).toFixed(1)+" MB";
 c.messages.push({id:makeId(),text:"📎 "+file.name+" ("+size+") — selected locally; online transfer needs server upload.",sent:true,time:now(),reactions:[]});
 const saved=save();renderMessages();renderChats();if(saved)toast("File selected. This demo does not upload it to other users.");
}
async function startScreenRecording(){
 if(!navigator.mediaDevices?.getDisplayMedia||!window.MediaRecorder){toast("Screen recording is not supported in this browser.");return}
 try{
  const stream=await navigator.mediaDevices.getDisplayMedia({video:true,audio:true});
  recordingChunks=[];
  recording=new MediaRecorder(stream);
  recording.ondataavailable=e=>{if(e.data.size)recordingChunks.push(e.data)};
  recording.onstop=()=>{
   const blob=new Blob(recordingChunks,{type:recording?.mimeType||"video/webm"});
   const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="JURO-screen-recording.webm";a.click();
   setTimeout(()=>URL.revokeObjectURL(url),60000);stream.getTracks().forEach(t=>t.stop());
   $("#recordingPanel").hidden=true;$("#recordScreenBtn").disabled=false;toast("Recording saved to your device.");
  };
  recording.start();$("#recordingPanel").hidden=false;$("#recordScreenBtn").disabled=true;
  stream.getVideoTracks()[0].addEventListener("ended",()=>{if(recording?.state==="recording")recording.stop()});
 }catch(err){toast(err.name==="NotAllowedError"?"Screen recording permission was cancelled.":"Could not start screen recording.");}
}
function stopScreenRecording(){if(recording&&recording.state==="recording")recording.stop()}

function renderPeople(){
 const q=$("#peopleSearch").value.toLowerCase(),list=$("#peopleList");list.replaceChildren();
 data.chats.filter(c=>!c.isGroup&&`${c.name} ${c.phone}`.toLowerCase().includes(q)).forEach(c=>{
  const row=document.createElement("div");row.className="person-item";const av=document.createElement("div");av.className="avatar";av.textContent=initials(c.name);
  const meta=document.createElement("div");meta.className="person-meta";const n=document.createElement("b");n.textContent=c.name;const p=document.createElement("p");p.textContent=c.phone||"No phone number";meta.append(n,p);
  const open=document.createElement("button");open.className="secondary-btn";open.textContent="Message";open.onclick=()=>openChat(c.id);row.append(av,meta,open);list.append(row);
 });if(!list.children.length){const e=document.createElement("div");e.className="empty";e.textContent="No people found.";list.append(e)}
}
function renderStatuses(){
 const list=$("#statusList");list.replaceChildren();
 if(!data.statuses.length){const e=document.createElement("div");e.className="empty";e.textContent="No status updates yet.";list.append(e);return}
 data.statuses.slice().reverse().forEach(s=>{
  const row=document.createElement("div");row.className="status-item";
  if(s.kind==="image"){const img=document.createElement("img");img.src=s.url;img.alt="Status update";row.append(img)}
  else{const v=document.createElement("video");v.src=s.url;v.controls=true;v.preload="metadata";row.append(v)}
  const meta=document.createElement("div");meta.className="status-meta";const b=document.createElement("b");b.textContent=s.name;const p=document.createElement("p");p.textContent="Posted "+fmt(s.time);meta.append(b,p);if(s.caption){const cap=document.createElement("p");cap.className="status-caption";cap.textContent=s.caption;meta.append(cap)}
  const del=document.createElement("button");del.className="secondary-btn danger-text";del.textContent="Delete";del.onclick=()=>{if(confirm("Delete this status?")){data.statuses=data.statuses.filter(x=>x.id!==s.id);save();renderStatuses()}};row.append(meta,del);list.append(row);
 });
}
function addStatus(file){
 if(!file)return;if(!file.type.startsWith("image/")&&!file.type.startsWith("video/")){toast("Please choose an image or video.");return}
 if(file.size>15*1024*1024){toast("For this local demo, choose a file under 15 MB.");return}
 const caption=prompt("Write a status caption (optional):","");if(caption===null)return;
 const isVideo=file.type.startsWith("video/");
 const proceed=()=>{const reader=new FileReader();reader.onload=()=>{const status={id:makeId(),name:data.profile,kind:isVideo?"video":"image",url:reader.result,caption:caption.trim().slice(0,500),time:now()};data.statuses.push(status);if(!save()){data.statuses=data.statuses.filter(x=>x.id!==status.id);renderStatuses();return}renderStatuses();toast("Status added on this browser.")};reader.onerror=()=>toast("Could not read this file.");reader.readAsDataURL(file)};
 if(isVideo){const u=URL.createObjectURL(file),v=document.createElement("video");v.preload="metadata";v.onloadedmetadata=()=>{URL.revokeObjectURL(u);if(v.duration>120){toast("Video status must be 2 minutes or less.");return}proceed()};v.onerror=()=>{URL.revokeObjectURL(u);toast("Could not read video duration.")};v.src=u;}else proceed();
}
function renderCalls(){
 const list=$("#callList");list.replaceChildren();
 if(!data.calls.length){const e=document.createElement("div");e.className="empty";e.textContent="No recent calls.";list.append(e);return}
 data.calls.slice().reverse().forEach(c=>{const row=document.createElement("div");row.className="call-item";const icon=document.createElement("div");icon.className="avatar";icon.textContent=c.kind==="video"?"🎥":"📞";const meta=document.createElement("div");meta.className="person-meta";const b=document.createElement("b");b.textContent=c.name;const p=document.createElement("p");p.textContent=(c.kind==="video"?"Video":"Audio")+" call · "+fmt(c.time);meta.append(b,p);row.append(icon,meta);list.append(row)});
}
function startCall(kind,contact){
 const c=contact||data.chats.find(x=>x.id===activeId);if(!c){toast("Open a chat or choose a contact first.");return}
 $("#callAvatar").textContent=initials(c.name);$("#callName").textContent=c.name;$("#callType").textContent=(kind==="video"?"Video":"Audio")+" call demo";
 $("#callScreen").hidden=kind!=="video";$("#callModal").hidden=false;
 data.calls.push({id:makeId(),name:c.name,kind,time:now()});save();renderCalls();
}
function endCall(){$("#callModal").hidden=true;toast("Demo call ended.")}
function setupInstall(){
 const installRow=$("#installAppRow"),installButton=$("#installAppBtn");
 const installHelp=$("#installAppHelp"),welcomeButton=$("#welcomeInstallBtn"),welcomeHint=$("#welcomeInstallHint");
 const isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
 const isStandalone=window.matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;
 if(isIOS&&!isStandalone){
  installRow.hidden=false;installButton.hidden=true;
  installHelp.textContent="Open JURO in Safari, tap Share, then choose Add to Home Screen.";
  welcomeHint.hidden=false;welcomeHint.textContent="On iPhone or iPad, open JURO in Safari and use Share to add it to your Home Screen.";
 }
 window.addEventListener("beforeinstallprompt",event=>{
  event.preventDefault();installPrompt=event;installRow.hidden=false;installButton.hidden=false;
  installHelp.textContent="Add JURO to your device for quick access.";
  welcomeButton.hidden=false;welcomeHint.hidden=true;
 });
 window.addEventListener("appinstalled",()=>{
  installPrompt=null;installRow.hidden=true;welcomeButton.hidden=true;welcomeHint.hidden=true;toast("JURO was installed.");
 });
 const promptInstall=async()=>{
  if(!installPrompt){toast("Open your browser menu and choose Install JURO.");return}
  const promptEvent=installPrompt;installPrompt=null;installRow.hidden=true;
  welcomeButton.hidden=true;
  try{
   await promptEvent.prompt();
   const choice=await promptEvent.userChoice;
   if(choice.outcome==="dismissed")toast("JURO installation was cancelled.");
  }catch(error){
   console.error("Could not install JURO.",error);
   toast("Could not start installation. Try Chrome's menu to install JURO.");
  }
 };
 installButton.addEventListener("click",promptInstall);
 welcomeButton.addEventListener("click",promptInstall);
 if("serviceWorker"in navigator&&window.isSecureContext){
  navigator.serviceWorker.register("./service-worker.js").catch(error=>{
   console.error("Could not register the JURO service worker.",error);
  });
 }
}
let pendingPhone="",pendingDisplayName="",resendTimer=null,activeOnlineUserId=null;
function setAuthFeedback(message,isError=false){
 const feedback=$("#authFeedback");feedback.textContent=message;feedback.classList.toggle("error",isError);
}
function authErrorMessage(error,action){
 const status=Number(error?.status||error?.context?.status||0);
 if(status===522)return "Supabase timed out (HTTP 522) while "+action+". Check your project status and try again later.";
 if(status)return(error?.message||"Supabase request failed.")+" (HTTP "+status+").";
 return error?.message||"Could not "+action+". Check your connection and try again.";
}
function startResendCooldown(){
 const button=$("#resendOtpBtn");let seconds=30;
 if(resendTimer)clearInterval(resendTimer);
 button.disabled=true;button.textContent="Resend in "+seconds+"s";
 resendTimer=setInterval(()=>{
  seconds--;
  if(seconds<=0){clearInterval(resendTimer);resendTimer=null;button.disabled=false;button.textContent="Resend code"}
  else button.textContent="Resend in "+seconds+"s";
 },1000);
}
async function requestPhoneOtp(event,isResend=false){
 if(event)event.preventDefault();
 if(!supabaseClient){setAuthFeedback("Supabase is not configured.",true);return}
 if(!isResend){
  pendingPhone=normalizePhone($("#authPhone").value);
  pendingDisplayName=$("#authDisplayName").value.trim().slice(0,60);
  if(!validPhone(pendingPhone)){setAuthFeedback("Enter your number with country code, for example +923112345678.",true);return}
 }
 const button=isResend?$("#resendOtpBtn"):$("#sendOtpBtn");
 button.disabled=true;setAuthFeedback("Sending your verification code…");
 try{
  const options={};
  if(pendingDisplayName)options.data={display_name:pendingDisplayName};
  const {error}=await supabaseClient.auth.signInWithOtp({phone:pendingPhone,options});
  if(error){console.error("Could not send JURO verification code.",error);setAuthFeedback(authErrorMessage(error,"sending the verification code"),true);return}
  if(!isResend){
   $("#phoneAuthForm").hidden=true;$("#verifyOtpForm").hidden=false;
   $("#otpDestination").textContent="Enter the code sent to "+pendingPhone+".";
   $("#authOtp").focus();
  }
  setAuthFeedback(isResend?"A new code was sent.":"Verification code sent.");
  startResendCooldown();
 }catch(error){
  console.error("Could not send JURO verification code.",error);
  setAuthFeedback(authErrorMessage(error,"sending the verification code"),true);
 }finally{
  if(!isResend)button.disabled=false;
  else if(!resendTimer)button.disabled=false;
 }
}
async function handleOnlineSession(session){
 if(!session?.user){
  currentUser=null;activeOnlineUserId=null;data.chats=[];activeId=null;
  if(activeMessagesChannel&&supabaseClient){supabaseClient.removeChannel(activeMessagesChannel).catch(error=>console.error("Could not close the message subscription.",error));activeMessagesChannel=null}
  if(activeChatListChannel&&supabaseClient){supabaseClient.removeChannel(activeChatListChannel).catch(error=>console.error("Could not close the chat-list subscription.",error));activeChatListChannel=null}
  $("#app").hidden=true;$("#authGate").hidden=false;$("#signOutRow").hidden=true;
  $("#verifyOtpForm").hidden=true;$("#phoneAuthForm").hidden=false;
  return;
 }
 if(activeOnlineUserId===session.user.id&&!$("#app").hidden)return;
 activeOnlineUserId=session.user.id;currentUser=session.user;
 $("#authGate").hidden=true;$("#app").hidden=false;$("#signOutRow").hidden=false;
 $(".sidebar-foot").textContent="JURO · Text chats sync with your account";
 $("#welcomePage").querySelector("p").textContent="Your JURO chats sync with your account across devices.";
 $("#settingsPage .settings-note").textContent="Your account and text messages sync through Supabase. Calls, media, and status updates are not included in this release.";
 let profile=null;
 try{
  const result=await supabaseClient.from("profiles").select("display_name").eq("id",currentUser.id).maybeSingle();
  if(result.error){console.error("Could not load JURO profile.",result.error);toast("Signed in, but your profile could not be loaded.")}
  else profile=result.data;
 }catch(error){console.error("Could not load JURO profile.",error);toast("Signed in, but your profile could not be loaded.")}
 data.profile=profile?.display_name||currentUser.user_metadata?.display_name||currentUser.phone||"JURO User";
 applySettings();await loadRemoteChats();subscribeToChatList();subscribeToMessages();
}
function setupOnlineMode(){
 if(!onlineMode){
  $("#app").hidden=true;$("#authGate").hidden=false;
  const warning=$("#authConfigWarning");
  warning.hidden=false;
  const missingSettings=[];
  if(!supabaseConfig.url)missingSettings.push("project URL");
  if(!supabaseConfig.anonKey)missingSettings.push("public anon key");
  warning.textContent="Phone sign-in is not configured yet. Add your Supabase "+missingSettings.join(" and ")+" to supabase-config.js to enable SMS verification.";
  $("#sendOtpBtn").disabled=true;
  $("#demoModeBtn").hidden=false;
  $("#demoModeBtn").onclick=()=>{$("#authGate").hidden=true;$("#app").hidden=false};
  return;
 }
 document.querySelectorAll('[data-page="status"],[data-page="calls"]').forEach(button=>button.hidden=true);
 $(".main-nav").style.gridTemplateColumns="repeat(4,minmax(0,1fr))";
 $("#startAudio").hidden=true;$("#startVideo").hidden=true;$("#audioCallBtn").hidden=true;$("#videoCallBtn").hidden=true;
 $("#attachFileBtn").hidden=true;$("#chatFile").disabled=true;
 $("#clearData").closest(".setting-row").hidden=true;$("#signOutRow").hidden=false;
 $("#app").hidden=true;$("#authGate").hidden=false;
 const warning=$("#authConfigWarning");
 if(!supabaseClient){
  warning.hidden=false;
  warning.textContent=supabaseInitError?.message||"Add your Supabase project URL and public anon key to supabase-config.js to enable phone sign-in.";
  $("#sendOtpBtn").disabled=true;
  return;
 }
 $("#phoneAuthForm").onsubmit=requestPhoneOtp;
 $("#verifyOtpForm").onsubmit=async event=>{
  event.preventDefault();const token=$("#authOtp").value.trim();
  if(!/^\d{4,10}$/.test(token)){setAuthFeedback("Enter the numeric code from your SMS.",true);return}
  const button=$("#verifyOtpBtn");button.disabled=true;setAuthFeedback("Verifying code…");
  try{
   const {data,error}=await supabaseClient.auth.verifyOtp({phone:pendingPhone,token,type:"sms"});
   if(error){console.error("Could not verify JURO code.",error);setAuthFeedback(authErrorMessage(error,"verifying the code"),true);return}
   $("#authOtp").value="";setAuthFeedback("");await handleOnlineSession(data.session);
  }catch(error){
   console.error("Could not verify JURO code.",error);
   setAuthFeedback(authErrorMessage(error,"verifying the code"),true);
  }finally{button.disabled=false}
 };
 $("#changePhoneBtn").onclick=()=>{
  if(resendTimer){clearInterval(resendTimer);resendTimer=null}
  $("#resendOtpBtn").disabled=false;$("#resendOtpBtn").textContent="Resend code";
  $("#verifyOtpForm").hidden=true;$("#phoneAuthForm").hidden=false;$("#authOtp").value="";setAuthFeedback("");
 };
 $("#resendOtpBtn").onclick=()=>requestPhoneOtp(null,true);
 $("#signOutBtn").onclick=async()=>{
  try{
   const {error}=await supabaseClient.auth.signOut();
   if(error)toast("Could not sign out: "+error.message);
  }catch(error){toast("Could not sign out: "+error.message)}
 };
 supabaseClient.auth.onAuthStateChange((_event,session)=>setTimeout(()=>{
  handleOnlineSession(session).catch(error=>{
   console.error("Could not update JURO sign-in state.",error);
   setAuthFeedback("Could not load your account. Check your connection and try again.",true);
  });
 },0));
 (async()=>{
  try{
   const {data,error}=await supabaseClient.auth.getSession();
   if(error){setAuthFeedback("Could not restore your sign-in: "+error.message,true);return}
   await handleOnlineSession(data.session);
  }catch(error){
  console.error("Could not restore JURO sign-in.",error);
  setAuthFeedback("Could not connect to Supabase. Check your project settings.",true);
  }
 })();
}
function applySettings(){$("body").classList.toggle("dark",!!data.dark);$("#darkToggle").checked=!!data.dark;$("#profileNameLabel").textContent=data.profile}
function setup(){
 document.querySelectorAll(".nav-btn").forEach(b=>b.onclick=()=>switchPage(b.dataset.page));
 $("#newChatBtn").onclick=()=>newContact("chat");$("#newGroupBtn").onclick=createGroup;$("#createGroupPageBtn").onclick=createGroup;$("#floatingAdd").onclick=()=>newContact("chat");$("#welcomeStart").onclick=()=>newContact("chat");
 $("#addPersonBtn").onclick=()=>newContact("person");$("#closeModal").onclick=closeContact;$("#cancelModal").onclick=closeContact;$("#contactForm").onsubmit=saveContact;
 $("#backChats").onclick=()=>switchPage("chats");$("#messageForm").onsubmit=send;$("#searchInput").oninput=renderChats;$("#peopleSearch").oninput=renderPeople;
 document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{filter=b.dataset.filter;document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===b));renderChats()});
 $("#emojiToggle").onclick=()=>$("#emojiPicker").hidden=!$("#emojiPicker").hidden;
 EMOJIS.forEach(e=>{const b=document.createElement("button");b.type="button";b.textContent=e;b.onclick=()=>{const i=$("#messageInput");i.value+=e;i.focus()};$("#emojiPicker").append(b)});
 $("#addStatusBtn").onclick=()=>$("#statusFile").click();$(".status-compose").onclick=()=>$("#statusFile").click();$("#statusFile").onchange=e=>{addStatus(e.target.files[0]);e.target.value=""};
 $("#startAudio").onclick=()=>startCall("audio");$("#startVideo").onclick=()=>startCall("video");$("#audioCallBtn").onclick=()=>startCall("audio");$("#videoCallBtn").onclick=()=>startCall("video");
 $("#endCall").onclick=endCall;$("#endCallTop").onclick=endCall;
 $("#profileViewBtn").onclick=viewProfile;$("#closeProfile").onclick=()=>$("#profileModal").hidden=true;
 $("#profileModal").onclick=e=>{if(e.target.id==="profileModal")$("#profileModal").hidden=true};
 $("#attachFileBtn").onclick=()=>$("#chatFile").click();$("#chatFile").onchange=e=>{attachFile(e.target.files[0]);e.target.value=""};
 $("#recordScreenBtn").onclick=startScreenRecording;$("#stopRecordingBtn").onclick=stopScreenRecording;
 $("#deleteChatBtn").onclick=()=>{const c=data.chats.find(x=>x.id===activeId);if(!c)return;if(confirm(`Delete the entire chat with ${c.name}?`)){data.chats=data.chats.filter(x=>x.id!==activeId);activeId=null;const saved=save();switchPage("chats");if(saved)toast("Chat deleted.")}};
 $("#darkToggle").onchange=e=>{data.dark=e.target.checked;save();applySettings()};
 $("#editProfile").onclick=async()=>{
  const name=prompt("Enter your profile name:",data.profile);if(!name||!name.trim())return;
  const updatedName=name.trim().slice(0,60);
  if(onlineMode){
   if(!supabaseClient||!currentUser)return;
   try{
    const {error}=await supabaseClient.from("profiles").update({display_name:updatedName}).eq("id",currentUser.id);
    if(error){toast("Could not update your profile: "+error.message);return}
   }catch(error){toast("Could not update your profile: "+error.message);return}
  }
  data.profile=updatedName;const saved=save();applySettings();if(saved)toast("Profile updated.");
 };
 $("#notificationBtn").onclick=async()=>{if(!("Notification"in window)){toast("Notifications are not supported in this browser.");return}try{const permission=await Notification.requestPermission();toast(permission==="granted"?"Notifications enabled.":"Notification permission not granted.")}catch{toast("Could not enable notifications.")}};
 $("#clearData").onclick=()=>{if(confirm("Clear all JURO demo chats, statuses and call history? This cannot be undone.")){localStorage.removeItem(KEY);data={chats:seed(),statuses:[],calls:[],profile:"JURO User",dark:false};activeId=null;applySettings();switchPage("chats");toast("Demo data cleared.")}};
 if(onlineMode)$("#signOutRow").hidden=false;
 $("#modalBg").onclick=e=>{if(e.target.id==="modalBg")closeContact()};
 $("#callModal").onclick=e=>{if(e.target.id==="callModal")endCall()};
 document.addEventListener("keydown",e=>{if(e.key==="Escape"){closeContact();$("#callModal").hidden=true;$("#emojiPicker").hidden=true}});
 setupInstall();
 applySettings();renderChats();renderStatuses();renderCalls();renderPeople();renderGroups();
}
setup();setupOnlineMode();
})();
