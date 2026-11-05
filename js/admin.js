const supabaseClient=window.supabaseClient;
if(!supabaseClient)throw new Error("Supabase is not configured. Check js/supabase-config.js.");
const ADMIN_UID="e589f58a-d36a-4eae-9449-e3122b660bc0", BUCKET_NAME="study-notes", MAX_FILE_SIZE=20*1024*1024;
const $=id=>document.getElementById(id);
const loginSection=$("adminLoginSection"),loginForm=$("adminLoginForm"),emailInput=$("adminEmail"),passwordInput=$("adminPassword"),loginButton=$("adminLoginButton"),adminStatus=$("adminStatus"),dashboard=$("adminDashboard"),welcome=$("adminWelcome"),logoutButton=$("adminLogoutButton");
const uploadForm=$("uploadForm"),noteTitle=$("noteTitle"),noteSubject=$("noteSubject"),noteClass=$("noteClass"),noteTeacher=$("noteTeacher"),noteFile=$("noteFile"),uploadButton=$("uploadButton"),uploadStatus=$("uploadStatus");
const adminNotesSearch=$("adminNotesSearch"),adminNotesCount=$("adminNotesCount"),adminNotesList=$("adminNotesList"),adminManagementStatus=$("adminManagementStatus"),editNoteForm=$("editNoteForm"),editNoteId=$("editNoteId"),editNoteTitle=$("editNoteTitle"),editNoteSubject=$("editNoteSubject"),editNoteClass=$("editNoteClass"),editNoteTeacher=$("editNoteTeacher"),saveNoteButton=$("saveNoteButton"),cancelEditButton=$("cancelEditButton"),editNoteStatus=$("editNoteStatus");
let currentUser=null,notes=[];
function escapeHTML(v){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function formatDate(v){const d=new Date(v);return Number.isNaN(d.getTime())?"Date unavailable":d.toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"});}
function authorised(user){return !!user&&user.id===ADMIN_UID;}
function setUI(user){
 currentUser=authorised(user)?user:null;loginSection.hidden=!!currentUser;dashboard.hidden=!currentUser;
 if(currentUser){welcome.textContent=`Signed in as ${currentUser.email||"admin"}`;adminStatus.textContent="";loadNotes();}
 else{notes=[];passwordInput.value="";editNoteForm.hidden=true;adminNotesList.innerHTML="<p>Sign in with the authorised admin account to manage notes.</p>";adminNotesCount.textContent="0 notes";if(user){adminStatus.textContent="This account is not authorised to access the admin dashboard.";supabaseClient.auth.signOut();}}
}
async function loadNotes(){
 if(!currentUser)return;adminNotesList.innerHTML="<p>Loading notes...</p>";
 try{const{data,error}=await supabaseClient.from("notes").select("id,title,subject,class_name,teacher,file_name,file_path,created_at").order("created_at",{ascending:false});if(error)throw error;
 notes=(data||[]).map(n=>({id:n.id,title:n.title,subject:n.subject,className:n.class_name||"",teacher:n.teacher||"",fileName:n.file_name,filePath:n.file_path,createdAt:n.created_at}));renderNotes();
 }catch(e){console.error(e);adminManagementStatus.textContent="Could not load notes. Check connection and permissions.";adminNotesList.innerHTML="<p>Unable to load notes.</p>";}
}
function renderNotes(){
 if(!currentUser)return;const term=adminNotesSearch.value.trim().toLowerCase();
 const list=notes.filter(n=>n.title.toLowerCase().includes(term)||n.subject.toLowerCase().includes(term)||(n.className||"").toLowerCase().includes(term)||(n.teacher||"").toLowerCase().includes(term)||n.fileName.toLowerCase().includes(term));
 adminNotesCount.textContent=`${list.length} ${list.length===1?"note":"notes"}`;
 if(!list.length){adminNotesList.innerHTML='<div class="empty-state"><h3>No matching notes</h3><p>Try another search, or upload a note first.</p></div>';return;}
 adminNotesList.innerHTML=list.map(n=>`<article class="admin-note-row"><div class="admin-note-details"><h3>${escapeHTML(n.title)}</h3><p>${escapeHTML(n.className || "Class not set")} · ${escapeHTML(n.subject)} · ${escapeHTML(n.teacher || "Teacher not set")} · ${escapeHTML(n.fileName)}</p><small>Added ${formatDate(n.createdAt)}</small></div><div class="admin-note-actions"><button type="button" class="btn btn-secondary" data-admin-action="edit" data-id="${escapeHTML(n.id)}">Edit</button><button type="button" class="btn btn-danger" data-admin-action="delete" data-id="${escapeHTML(n.id)}">Delete</button></div></article>`).join("");
}
function closeEdit(){editNoteForm.reset();editNoteForm.hidden=true;editNoteId.value="";editNoteStatus.textContent="";}
adminNotesSearch.addEventListener("input",renderNotes);
adminNotesList.addEventListener("click",async e=>{
 const b=e.target.closest("button[data-admin-action]");if(!b||!currentUser)return;const n=notes.find(x=>x.id===b.dataset.id);if(!n)return;
 if(b.dataset.adminAction==="edit"){editNoteId.value=n.id;editNoteTitle.value=n.title;editNoteSubject.value=n.subject;editNoteClass.value=n.className||"";editNoteTeacher.value=n.teacher||"";editNoteStatus.textContent="";editNoteForm.hidden=false;editNoteForm.scrollIntoView({behavior:"smooth",block:"center"});editNoteTitle.focus();return;}
 if(!confirm(`Delete "${n.title}" and its PDF? This cannot be undone.`))return;b.disabled=true;adminManagementStatus.textContent="Deleting note...";
 let rowDeleted=false;
 try{const{data,error}=await supabaseClient.from("notes").delete().eq("id",n.id).select("id").maybeSingle();if(error)throw error;if(!data)throw new Error("No database row was deleted.");rowDeleted=true;notes=notes.filter(x=>x.id!==n.id);renderNotes();if(editNoteId.value===n.id)closeEdit();
 const{error:storageError}=await supabaseClient.storage.from(BUCKET_NAME).remove([n.filePath]);if(storageError){console.error(storageError);adminManagementStatus.textContent="The note record was deleted, but its PDF remains in Storage. Remove the exact leftover file manually.";}else adminManagementStatus.textContent="Note and PDF deleted successfully.";
 }catch(err){console.error(err);adminManagementStatus.textContent=rowDeleted?"The note was removed, but Storage cleanup could not be confirmed. Check the bucket.":"Could not delete the note record. The PDF was left untouched. Check admin permissions.";}finally{b.disabled=false;}
});
editNoteForm.addEventListener("submit",async e=>{
 e.preventDefault();if(!currentUser)return;const id=editNoteId.value,title=editNoteTitle.value.trim(),subject=editNoteSubject.value,className=editNoteClass.value.trim(),teacher=editNoteTeacher.value.trim();if(!id||!title||!subject||!className){editNoteStatus.textContent="Enter a title, class, and subject.";return;}
 saveNoteButton.disabled=true;editNoteStatus.textContent="Saving changes...";
 try{const{data,error}=await supabaseClient.from("notes").update({title,subject,class_name:className,teacher:teacher||null}).eq("id",id).select("id,title,subject,class_name,teacher,file_name,file_path,created_at").single();if(error)throw error;
 notes=notes.map(n=>n.id===id?{...n,title:data.title,subject:data.subject,className:data.class_name||"",teacher:data.teacher||"",fileName:data.file_name,filePath:data.file_path,createdAt:data.created_at}:n);closeEdit();renderNotes();adminManagementStatus.textContent="Note details updated successfully.";
 }catch(err){console.error(err);editNoteStatus.textContent="Could not save changes. Check connection and admin permissions.";}finally{saveNoteButton.disabled=false;}
});
cancelEditButton.addEventListener("click",closeEdit);
loginForm.addEventListener("submit",async e=>{
 e.preventDefault();loginButton.disabled=true;adminStatus.textContent="Signing in...";
 try{const{data,error}=await supabaseClient.auth.signInWithPassword({email:emailInput.value.trim(),password:passwordInput.value});if(error)throw error;
 if(!authorised(data.user)){await supabaseClient.auth.signOut();adminStatus.textContent="This account is not authorised to access the admin dashboard.";return;}passwordInput.value="";setUI(data.user);
 }catch(err){console.error(err);adminStatus.textContent="Sign-in failed. Check your email and password.";}finally{loginButton.disabled=false;}
});
logoutButton.addEventListener("click",async()=>{logoutButton.disabled=true;try{const{error}=await supabaseClient.auth.signOut();if(error)throw error;setUI(null);}catch(e){console.error(e);adminManagementStatus.textContent="Sign-out failed. Please try again.";}finally{logoutButton.disabled=false;}});
uploadForm.addEventListener("submit",async e=>{
 e.preventDefault();if(!authorised(currentUser)){uploadStatus.textContent="You are not authorised to upload notes.";return;}
 const title=noteTitle.value.trim(),subject=noteSubject.value,className=noteClass.value.trim(),teacher=noteTeacher.value.trim(),file=noteFile.files[0];if(!title||!subject||!className||!file){uploadStatus.textContent="Please complete the required fields: title, subject, class, and PDF file.";return;}
 if(!(file.type==="application/pdf"||file.name.toLowerCase().endsWith(".pdf"))){uploadStatus.textContent="Only PDF files are allowed.";return;}
 if(file.size>MAX_FILE_SIZE){uploadStatus.textContent="The file exceeds the 20 MB limit.";return;}
 uploadButton.disabled=true;uploadStatus.textContent="Uploading PDF...";const path=`notes/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g,"_")}`;let uploaded=false;
 try{const{error:se}=await supabaseClient.storage.from(BUCKET_NAME).upload(path,file,{contentType:"application/pdf",upsert:false});if(se)throw se;uploaded=true;uploadStatus.textContent="Saving note details...";
 const{error:de}=await supabaseClient.from("notes").insert({title,subject,class_name:className,teacher:teacher||null,file_name:file.name,file_path:path});if(de)throw de;uploadForm.reset();uploadStatus.textContent="Note uploaded successfully.";await loadNotes();
 }catch(err){console.error(err);if(uploaded){const{error:cleanup}=await supabaseClient.storage.from(BUCKET_NAME).remove([path]);if(cleanup)console.error("Upload cleanup failed:",cleanup);}uploadStatus.textContent=err.message||"Upload failed. Check connection and permissions.";}finally{uploadButton.disabled=false;}
});
async function init(){const{data,error}=await supabaseClient.auth.getSession();if(error)console.error(error);setUI(data?.session?.user||null);supabaseClient.auth.onAuthStateChange((_event,session)=>setUI(session?.user||null));}
init();
