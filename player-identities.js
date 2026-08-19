(()=>{
  const catalog=[
    {id:678906,zh:'鄧愷威',en:'Kai-Wei Teng'},
    {id:691907,zh:'鄭宗哲',en:'Tsung-Che Cheng'},
    {zh:'劉致榮',en:'Chih-Jung Liu'},
    {id:696040,zh:'陳柏毓',en:'Po-Yu Chen'},
    {id:701678,zh:'李灝宇',en:'Hao-Yu Lee'},
    {id:800018,zh:'莊陳仲敖',en:'Chen Zhong-Ao Zhuang'},
    {id:801179,zh:'林昱珉',en:'Yu-Min Lin'},
    {id:800213,zh:'張弘稜',en:'Hung-Leng Chang'},
    {id:808486,zh:'李晨薰',en:'Chen-Hsun Lee'},
    {id:808207,zh:'潘文輝',en:'Wen-Hui Pan'},
    {id:809223,zh:'沙子宸',en:'Tzu-Chen Sha'},
    {zh:'林盛恩',en:'Sheng-En Lin'},
    {id:813820,zh:'林振瑋',en:'Chen-Wei Lin'},
    {id:827734,zh:'林維恩',en:'Wei-En Lin'},
    {id:828667,zh:'柯敬賢',en:'Ching-Hsien Ko'},
    {id:828430,zh:'沈家羲',en:'Chia-Shi Shen'},
    {zh:'陽念希',en:'Nien-Hsi Yang'},
    {id:829473,zh:'黃仲翔',en:'Chung-Hsiang Huang'},
    {zh:'林鉑濬',en:'Po-Chun Lin'},
    {zh:'林張子俊',en:'Chang Tzu-Chun Lin',aliases:['Tzu-Chun Lin']},
    {zh:'廖宥霖',en:'Yu-Lin Liao'},
    {id:837088,zh:'蘇嵐鴻',en:'Lan-Hong Su'},
    {zh:'賴謙凡',en:'Chien-Fan Lai'},
    {zh:'林珺希',en:'Chun-Hsi Lin',aliases:['Lin Chun-hsi','Chun Hsi Lin']},
    {zh:'何樺',en:'Hua Ho',aliases:['Ho Hua']},
    {zh:'林睿杰',en:'Ruei-Chieh Lin',aliases:['Lin Ruei-Chieh']}
  ];
  const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[-_'’.]/g,' ').replace(/[^a-z0-9\u3400-\u9fff ]/g,' ').replace(/\s+/g,' ').trim();
  const names=p=>[p.zh,p.en,...(p.aliases||[])].filter(Boolean).map(normalize);
  const byId=new Map(catalog.filter(p=>p.id).map(p=>[Number(p.id),p]));
  const byName=q=>{const n=normalize(q);return catalog.find(p=>names(p).some(name=>name===n))||null;};
  const matchName=q=>{const n=normalize(q);return catalog.filter(p=>names(p).some(name=>name.includes(n)||n.includes(name)));};
  const identify=player=>byId.get(Number(player?.id))||catalog.find(p=>names(p).includes(normalize(player?.fullName||player?.name)))||null;
  const label=player=>{const known=identify(player);return known?`${known.zh} ${known.en}`:String(player?.name||player?.fullName||'Unknown player');};
  const apply=list=>Array.isArray(list)?list.map(p=>({...p,name:label(p)})):list;
  window.TaiwanPlayerIdentities={catalog,byId,byName,matchName,identify,label,apply,normalize};
})();