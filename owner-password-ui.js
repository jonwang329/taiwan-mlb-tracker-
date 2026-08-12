(()=>{
  const LEGACY_REMEMBERED_KEY='twmlb_owner_remembered_key';
  try{localStorage.removeItem(LEGACY_REMEMBERED_KEY);}catch{}

  function patchOwnerUI(){
    const box=document.querySelector('#owner-unlock-box');
    if(!box)return;
    const field=box.querySelector('#owner-key-input');
    if(field){
      field.placeholder='輸入 Owner Password';
      field.autocomplete='current-password';
      field.setAttribute('aria-label','Owner Password');
    }
    const remember=box.querySelector('#owner-remember');
    if(remember){
      remember.checked=false;
      if(remember.parentElement)remember.parentElement.hidden=true;
    }
    const strong=box.querySelector('strong');
    const span=box.querySelector('span');
    if(strong&&!box.classList.contains('is-unlocked'))strong.textContent='Owner Password';
    if(span&&!box.classList.contains('is-unlocked'))span.textContent='輸入你在 GitHub Secret 設定的自訂密碼即可管理觀察名單。';
  }

  const observer=new MutationObserver(patchOwnerUI);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('click',event=>{
    if(event.target.closest('#manage-players-btn'))setTimeout(patchOwnerUI,0);
  });
  patchOwnerUI();
})();
