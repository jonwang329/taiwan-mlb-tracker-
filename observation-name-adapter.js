(()=>{
  const identities=window.TaiwanPlayerIdentities;
  const base=String(window.OBSERVATION_API_URL||'').replace(/\/$/,'');
  if(!identities||!base||typeof window.fetch!=='function')return;
  const originalFetch=window.fetch.bind(window);
  window.fetch=async(input,init)=>{
    const response=await originalFetch(input,init);
    const url=typeof input==='string'?input:input?.url||'';
    const method=String(init?.method||input?.method||'GET').toUpperCase();
    if(method!=='GET'||!(url===`${base}/players`||url===base||url===`${base}/`))return response;
    try{
      const payload=await response.clone().json();
      const next=Array.isArray(payload)?identities.apply(payload):{...payload,players:identities.apply(payload?.players)};
      return new Response(JSON.stringify(next),{status:response.status,statusText:response.statusText,headers:response.headers});
    }catch{return response;}
  };
})();