(()=>{
  const catalog=[
    {id:701678,zh:'李灝宇',en:'Hao-Yu Lee'},
    {id:691907,zh:'鄭宗哲',en:'Tsung-Che Cheng'},
    {id:678906,zh:'鄧愷威',en:'Kai-Wei Teng'},
    {id:827734,zh:'林維恩',en:'Wei-En Lin'},
    {id:801179,zh:'林昱珉',en:'Yu-Min Lin'},
    {id:828667,zh:'柯敬賢',en:'Ching-Hsien Ko'},
    {id:813820,zh:'林振瑋',en:'Chen-Wei Lin'},
    {id:800018,zh:'莊陳仲敖',en:'Chen Zhong-Ao Zhuang'},
    {id:808486,zh:'李晨薰',en:'Chen-Hsun Lee'},
    {id:829473,zh:'黃仲翔',en:'Chung-Hsiang Huang'},
    {id:837088,zh:'蘇嵐鴻',en:'Lan-Hong Su'},
    {id:800213,zh:'張弘稜',en:'Hung-Leng Chang'}
  ];
  const byId=new Map(catalog.map(p=>[Number(p.id),p]));
  const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[-_'’.]/g,' ').replace(/[^a-z0-9\u3400-\u9fff ]/g,' ').replace(/\s+/g,' ').trim();
  const byName=q=>{const n=normalize(q);return catalog.find(p=>n===normalize(p.zh)||n===normalize(p.en))||null;};
  const label=player=>{const known=byId.get(Number(player?.id));return known?`${known.zh} ${known.en}`:String(player?.name||player?.fullName||'Unknown player');};
  const apply=list=>Array.isArray(list)?list.map(p=>({...p,name:label(p)})):list;
  window.TaiwanPlayerIdentities={catalog,byId,byName,label,apply,normalize};
})();