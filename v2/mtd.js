// PlateTrack v2 — Making Tax Digital for Income Tax (MTD ITSA) records.
// build.js adds this after jobfirst.js. It works out, from what's logged in PlateTrack:
//  - whether and when MTD applies (qualifying income over £50k in 2024/25 → from 6 April 2026,
//    over £30k in 2025/26 → from 6 April 2027, over £20k in 2026/27 → from 6 April 2028)
//  - each quarter's figures and the cumulative year-to-date totals that a quarterly update sends,
//    with expenses in HMRC's self-employment categories, and the deadlines (7 Aug, 7 Nov, 7 Feb, 7 May)
//  - a CSV for an accountant or bridging software.
// It doesn't send anything to HMRC (that needs HMRC-recognised software; see BACKLOG.md).
(function(){
  var MTD_RULES=[
    {year:'2024/25',threshold:50000,from:'2026-04-06'},
    {year:'2025/26',threshold:30000,from:'2027-04-06'},
    {year:'2026/27',threshold:20000,from:'2028-04-06'}
  ];
  var CONSOLIDATE_UNDER=90000; // turnover below the VAT threshold may send one expenses total
  // HMRC self-employment expense categories for PlateTrack's categories (reimbursed ones aren't allowable here)
  var CAR_VAN_TRAVEL=['Fuel','Travel','EV Charging','Tolls','Parking','Hotel'];
  function hmrcCat(cat){
    for(var i=0;i<CAR_VAN_TRAVEL.length;i++){if((cat||'').indexOf(CAR_VAN_TRAVEL[i])===0)return 'carVanTravel';}
    return 'other';
  }
  var HMRC_LABEL={carVanTravel:'Car, van and travel expenses',other:'Other business expenses'};

  function ymd(y,m,d){return y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');}
  function startYear(ty){return parseInt(ty.slice(0,4),10);}
  function daysUntil(ds){return Math.round((parseYMD(ds)-parseYMD(today()))/86400000);}
  function longDate(ds){return parseYMD(ds).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});}
  function shortDate(ds){return parseYMD(ds).toLocaleDateString('en-GB',{day:'numeric',month:'short'});}
  function useCalendar(){try{return localStorage.getItem('pt_mtd_calendar')==='1';}catch(e){return false;}}
  function sentMap(){try{return JSON.parse(localStorage.getItem('pt_mtd_sent')||'{}');}catch(e){return {};}}

  function quarters(ty,calendar){
    var y=startYear(ty),q=calendar
      ?[[ymd(y,4,1),ymd(y,6,30)],[ymd(y,7,1),ymd(y,9,30)],[ymd(y,10,1),ymd(y,12,31)],[ymd(y+1,1,1),ymd(y+1,3,31)]]
      :[[ymd(y,4,6),ymd(y,7,5)],[ymd(y,7,6),ymd(y,10,5)],[ymd(y,10,6),ymd(y+1,1,5)],[ymd(y+1,1,6),ymd(y+1,4,5)]];
    var due=[ymd(y,8,7),ymd(y,11,7),ymd(y+1,2,7),ymd(y+1,5,7)];
    return q.map(function(p,i){return {n:i+1,from:p[0],to:p[1],due:due[i],key:ty+'-'+(i+1)};});
  }
  function grossFor(ty){var t=0;DB.income.forEach(function(x){if(tyear(x.date)===ty)t+=parseFloat(x.amount||0);});return t;}
  function figures(from,to){
    var f={turnover:0,carVanTravel:0,other:0,reimbursed:0};
    DB.income.forEach(function(x){if(x.date>=from&&x.date<=to)f.turnover+=parseFloat(x.amount||0);});
    DB.expenses.forEach(function(e){
      if(!(e.date>=from&&e.date<=to))return;
      var a=parseFloat(e.amount||0);
      if(isReimbursedCat(e.category))f.reimbursed+=a;else f[hmrcCat(e.category)]+=a;
    });
    f.expenses=f.carVanTravel+f.other;f.profit=f.turnover-f.expenses;
    return f;
  }

  // When MTD starts for this driver, from PlateTrack income only.
  function eligibility(){
    var now=today(),cur=tyear(now);
    var rows=MTD_RULES.map(function(r){
      var g=grossFor(r.year),done=r.year<cur;
      return {year:r.year,threshold:r.threshold,from:r.from,gross:g,over:g>r.threshold,finished:done,current:r.year===cur};
    });
    var hit=null;for(var i=0;i<rows.length;i++){if(rows[i].over){hit=rows[i];break;}}
    return {rows:rows,from:hit?hit.from:null,applies:!!hit&&hit.from<=now};
  }
  // The next quarterly update not marked as sent: the oldest finished quarter first (due or overdue),
  // otherwise the quarter running now. Last tax year's Q4 is due 7 May, so it's included.
  function nextDeadline(el){
    if(!el.from)return null;
    var first=startYear(tyear(el.from)),ty=tyear(today()),prev=(startYear(ty)-1)+'/'+String(startYear(ty)).slice(-2);
    var sent=sentMap(),cal=useCalendar(),qs=[];
    [prev,ty].forEach(function(y){if(startYear(y)>=first)qs=qs.concat(quarters(y,cal));});
    if(!qs.length)qs=quarters(tyear(el.from),cal);
    for(var i=0;i<qs.length;i++){if(!sent[qs[i].key]&&qs[i].to<today())return qs[i];}
    for(i=0;i<qs.length;i++){if(!sent[qs[i].key])return qs[i];}
    return null;
  }

  function statusHTML(q,applies,sent){
    if(sent)return '<span class="mtd-st mtd-ok">&#x2713; Sent</span>';
    var t=today();
    if(t<q.from)return '<span class="mtd-st">Not started</span>';
    if(t<=q.to)return '<span class="mtd-st">In progress</span>';
    var d=daysUntil(q.due);
    if(!applies)return '<span class="mtd-st">Not required</span>';
    if(d<0)return '<span class="mtd-st mtd-late">Overdue</span>';
    return '<span class="mtd-st mtd-due">Due in '+d+' day'+(d===1?'':'s')+'</span>';
  }

  var VIEW={ty:null};
  function openMTD(ty){
    VIEW.ty=ty||VIEW.ty||tyear(today());
    var old=document.getElementById('mtdPage');if(old)old.remove();
    var el=eligibility(),cal=useCalendar(),sent=sentMap(),ty0=VIEW.ty;
    var applies=!!el.from&&startYear(tyear(el.from))<=startYear(ty0);
    var qs=quarters(ty0,cal),yFrom=qs[0].from,yTo=qs[3].to;
    var year=figures(yFrom,yTo);
    var cur=tyear(today()),years=[];for(var y=startYear(cur)+1;y>=2024;y--)years.push(y+'/'+String(y+1).slice(-2));

    var elig;
    if(el.from&&el.applies)elig='<div class="mtd-big mtd-yes">MTD applies to you<span>since '+longDate(el.from)+'</span></div>';
    else if(el.from)elig='<div class="mtd-big mtd-soon">MTD starts for you on '+longDate(el.from)+'<span>'+daysUntil(el.from)+' days to get ready</span></div>';
    else elig='<div class="mtd-big">MTD doesn\'t apply to you yet</div>';
    elig+='<div class="mtd-rules">'+el.rows.map(function(r){
      return '<div class="mtd-rule'+(r.over?' over':'')+'"><span>'+r.year+(r.current?' so far':'')+'</span><span>'+money(r.gross)+' <em>of £'+r.threshold.toLocaleString('en-GB')+'</em></span>'
        +'<span>'+(r.over?'&#x2713; from '+shortDate(r.from)+' '+r.from.slice(0,4):(r.current?'counting':'under'))+'</span></div>';
    }).join('')+'</div>'
      +'<div class="mtd-note">Counts self-employed income logged in PlateTrack, before expenses. Add any other self-employed or property income you have. Once MTD applies it carries on in later years unless your income stays below £20,000.</div>';

    var cum={turnover:0,carVanTravel:0,other:0,expenses:0,profit:0};
    var rowsHTML=qs.map(function(q){
      var f=figures(q.from,q.to);
      ['turnover','carVanTravel','other','expenses','profit'].forEach(function(k){cum[k]+=f[k];});
      var isSent=!!sent[q.key];
      return '<div class="mtd-q">'
        +'<div class="mtd-q-top"><span class="mtd-q-n">Q'+q.n+'</span><span class="mtd-q-p">'+shortDate(q.from)+' &ndash; '+shortDate(q.to)+'</span>'+statusHTML(q,applies,isSent)+'</div>'
        +'<div class="mtd-q-grid"><div><em>Income</em>'+money(f.turnover)+'</div><div><em>Expenses</em>'+money(f.expenses)+'</div><div><em>Profit</em>'+money(f.profit)+'</div></div>'
        +'<div class="mtd-q-ytd">Year to date (what the update sends): income '+money(cum.turnover)+' &middot; expenses '+money(cum.expenses)+' &middot; profit '+money(cum.profit)+'</div>'
        +'<div class="mtd-q-bot"><span>Deadline '+longDate(q.due)+'</span>'
        +(applies&&today()>q.to?'<label class="mtd-sent"><input type="checkbox" data-sent="'+q.key+'"'+(isSent?' checked':'')+'> Sent</label>':'')+'</div>'
        +'</div>';
    }).join('');

    var cats='<div class="mtd-cat"><span>'+HMRC_LABEL.carVanTravel+'<em>fuel, travel, EV charging, tolls, parking, hotels</em></span><b>'+money(year.carVanTravel)+'</b></div>'
      +'<div class="mtd-cat"><span>'+HMRC_LABEL.other+'<em>cleaning and anything else</em></span><b>'+money(year.other)+'</b></div>'
      +'<div class="mtd-cat mtd-cat-tot"><span>Total allowable expenses</span><b>'+money(year.expenses)+'</b></div>'
      +(year.reimbursed?'<div class="mtd-note">'+money(year.reimbursed)+' of reimbursed expenses are left out, as in the rest of PlateTrack (the money paid back isn\'t logged as income). If your accountant counts reimbursements as turnover, add them to both income and expenses.</div>':'')
      +(year.turnover<CONSOLIDATE_UNDER?'<div class="mtd-note">Your income is under £90,000, so you can send one total for expenses instead of the categories.</div>':'');

    var ov=document.createElement('div');
    ov.id='mtdPage';ov.className='mtd-page';
    ov.innerHTML='<div class="mtd-hdr"><button class="mtd-back" aria-label="Back">&#x2039;</button><div><div class="mtd-title">Making Tax Digital</div><div class="mtd-sub">Quarterly updates for Income Tax</div></div></div>'
      +'<div class="mtd-body">'
      +'<div class="mtd-card">'+elig+'</div>'
      +'<div class="mtd-years">'+years.map(function(y){return '<button data-ty="'+y+'" class="'+(y===ty0?'on':'')+'">'+y+'</button>';}).join('')+'</div>'
      +'<div class="mtd-card"><div class="mtd-h">'+ty0+' quarters</div>'
      +'<div class="mtd-toggle"><button data-cal="0" class="'+(cal?'':'on')+'">Standard (6 Apr)</button><button data-cal="1" class="'+(cal?'on':'')+'">Calendar (1 Apr)</button></div>'
      +rowsHTML
      +'<div class="mtd-note">Each update is cumulative: it sends the whole year so far, so a mistake in an earlier quarter is fixed in the next one. The final declaration for '+ty0+' is due by '+longDate(ymd(startYear(ty0)+2,1,31))+'.</div></div>'
      +'<div class="mtd-card"><div class="mtd-h">'+ty0+' expenses in HMRC categories</div>'+cats+'</div>'
      +'<button class="v2-big-btn v2-primary mtd-export">&#x2B07;&#xFE0F; Download '+ty0+' figures (CSV)</button>'
      +'<div class="mtd-note mtd-foot">PlateTrack keeps the records and works out the figures. Sending them to HMRC needs HMRC-recognised software: give this file to your accountant or use bridging software.</div>'
      +'</div>';
    ov.addEventListener('click',function(e){
      if(e.target.closest('.mtd-back')){ov.remove();return;}
      var b=e.target.closest('[data-ty]');if(b){openMTD(b.getAttribute('data-ty'));return;}
      var c=e.target.closest('[data-cal]');if(c){try{localStorage.setItem('pt_mtd_calendar',c.getAttribute('data-cal'));}catch(er){}openMTD();render(CTAB);return;}
      if(e.target.closest('.mtd-export')){exportCSV(ty0);return;}
    });
    ov.addEventListener('change',function(e){
      var k=e.target.getAttribute('data-sent');if(!k)return;
      var m=sentMap();if(e.target.checked)m[k]=true;else delete m[k];
      try{localStorage.setItem('pt_mtd_sent',JSON.stringify(m));}catch(er){}
      openMTD();render(CTAB);
    });
    document.body.appendChild(ov);
  }
  window.openMTD=openMTD;

  function csvCell(v){v=String(v==null?'':v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;}
  function n2(v){return (Math.round(v*100)/100).toFixed(2);}
  function mtdCSV(ty){
    var cal=useCalendar(),qs=quarters(ty,cal),cum={turnover:0,carVanTravel:0,other:0,expenses:0,profit:0,reimbursed:0};
    var lines=[['PlateTrack - Making Tax Digital figures'],['Tax year',ty],['Update periods',cal?'Calendar quarters (1 April)':'Standard quarters (6 April)'],['Generated',new Date().toLocaleDateString('en-GB')],[],
      ['Quarter','Period start','Period end','Deadline','Income','Car van and travel expenses','Other business expenses','Total expenses','Profit','Income (year to date)','Car van and travel (year to date)','Other (year to date)','Total expenses (year to date)','Profit (year to date)']];
    qs.forEach(function(q){
      var f=figures(q.from,q.to);
      Object.keys(cum).forEach(function(k){cum[k]+=f[k];});
      lines.push(['Q'+q.n,q.from,q.to,q.due,n2(f.turnover),n2(f.carVanTravel),n2(f.other),n2(f.expenses),n2(f.profit),n2(cum.turnover),n2(cum.carVanTravel),n2(cum.other),n2(cum.expenses),n2(cum.profit)]);
    });
    lines.push([],['Expenses by PlateTrack category (whole year)'],['PlateTrack category','HMRC category','Amount']);
    var byCat={};
    DB.expenses.forEach(function(e){if(e.date>=qs[0].from&&e.date<=qs[3].to&&!isReimbursedCat(e.category)){byCat[e.category||'Other']=(byCat[e.category||'Other']||0)+parseFloat(e.amount||0);}});
    Object.keys(byCat).sort().forEach(function(c){lines.push([c,HMRC_LABEL[hmrcCat(c)],n2(byCat[c])]);});
    lines.push([],['Reimbursed expenses left out of the figures',n2(cum.reimbursed)]);
    return lines.map(function(r){return r.map(csvCell).join(',');}).join('\n')+'\n';
  }
  function exportCSV(ty){
    try{
      var blob=new Blob([mtdCSV(ty)],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=url;a.download='platetrack-mtd-'+ty.replace('/','-')+'.csv';
      document.body.appendChild(a);a.click();
      setTimeout(function(){document.body.removeChild(a);URL.revokeObjectURL(url);},100);
      showToast('MTD figures downloaded');
    }catch(e){showToast('Download failed');}
  }
  window.mtdCSV=mtdCSV;

  // ── Cards: Insights always; Overview once MTD applies or starts within a year ──
  function cardHTML(compact){
    var el=eligibility(),nx=nextDeadline(el),line;
    if(el.from&&!el.applies)line='MTD starts for you on '+longDate(el.from)+' ('+daysUntil(el.from)+' days)';
    else if(nx){
      var d=daysUntil(nx.due);
      line='Q'+nx.n+' update (to '+shortDate(nx.to)+') '+(d<0?'overdue since '+shortDate(nx.due):'due '+shortDate(nx.due)+' &middot; '+d+' day'+(d===1?'':'s'));
    }
    else if(el.applies)line='All updates marked as sent';
    else line='Not required yet. See your quarterly figures and HMRC categories';
    var late=nx&&el.applies&&daysUntil(nx.due)<0;
    return '<button class="mtd-entry'+(compact?' mtd-entry-sm':'')+(late?' late':'')+'" onclick="openMTD()"><span class="mtd-entry-ic">&#x1F3DB;&#xFE0F;</span>'
      +'<span><b>Making Tax Digital</b><span>'+line+'</span></span><span class="mtd-entry-go">&rsaquo;</span></button>';
  }
  var _v2Summary=rSummary;
  rSummary=function(){
    _v2Summary.apply(this,arguments);
    var pg=document.getElementById('pg3');if(!pg)return;
    var hdr=pg.querySelector('.tab-hdr');
    var box=document.createElement('div');box.className='mtd-slot';box.innerHTML=cardHTML(false);
    if(hdr&&hdr.parentNode)hdr.parentNode.insertAdjacentElement('afterend',box);else pg.insertBefore(box,pg.firstChild);
  };
  var _v2Dash=rDash;
  rDash=function(){
    _v2Dash.apply(this,arguments);
    var el=eligibility();
    if(!el.from||daysUntil(el.from)>365)return;
    var pg=document.getElementById('pg0'),anchor=pg&&pg.querySelector('.stat-row');
    if(!anchor)return;
    var box=document.createElement('div');box.className='mtd-slot mtd-slot-dash';box.innerHTML=cardHTML(true);
    anchor.insertAdjacentElement('afterend',box);
  };
  render(CTAB);
})();
