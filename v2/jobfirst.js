// PlateTrack v2 — job-first layout.
// build.js adds this file to a copy of index.html and publishes it at /Plate-Track/v2/.
// It only changes how the app is laid out: the data (DB, pt9, Supabase rows) is exactly the same
// as the current app, so both versions can be used side by side on the same records.
// Flow: Jobs home → New job (scan or type) → the job page → add expenses / travel to that job.
(function(){
  var V2={returnTo:null};
  window.V2=V2;

  // ── Tabs: 0 = Jobs (new home), 1 = Overview (the old Home dashboard) ──
  var _v1Dash=rDash;
  // The old dashboard writes into #pg0; borrow that id for #pg1 while it renders.
  function renderOldDashIntoPg1(){
    var pg0=document.getElementById('pg0'),pg1=document.getElementById('pg1');
    if(!pg0||!pg1)return;
    pg0.id='pg0-v2tmp';pg1.id='pg0';
    try{_v1Dash();}finally{pg1.id='pg1';pg0.id='pg0';}
  }
  rDash=function(){rJobsHome();};
  rJobsOverview=function(){renderOldDashIntoPg1();};

  var JOBS_ICON='<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>';
  var HOME_ICON='<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>';
  function relabelTabs(){
    var t0=document.getElementById('tab0'),t1=document.getElementById('tab1');
    if(t0){t0.querySelector('.tb-icon').innerHTML=JOBS_ICON;t0.querySelector('.tb-label').textContent='Jobs';}
    if(t1){t1.querySelector('.tb-icon').innerHTML=HOME_ICON;t1.querySelector('.tb-label').textContent='Overview';}
    var fab=document.getElementById('fabBtn');
    if(fab)fab.setAttribute('aria-label','New job');
  }

  // ── The + button starts a new job ──
  toggleFAB=function(){openNewJob();};

  var camIn=document.createElement('input'),libIn=document.createElement('input');
  camIn.type=libIn.type='file';
  camIn.accept=libIn.accept='image/*,.heic,.heif';
  camIn.setAttribute('capture','environment');
  camIn.style.display=libIn.style.display='none';
  camIn.id='v2-job-camera';libIn.id='v2-job-library';
  camIn.onchange=libIn.onchange=function(e){
    var f=e.target.files&&e.target.files[0];
    e.target.value='';
    if(f)startScannedJob(f);
  };
  document.body.appendChild(camIn);document.body.appendChild(libIn);

  function openNewJob(){
    closeV2Chooser();
    var ov=document.createElement('div');
    ov.className='v2-chooser';ov.id='v2Chooser';
    ov.innerHTML='<div class="v2-chooser-card" role="dialog" aria-label="New job">'
      +'<div class="v2-chooser-title">New job</div>'
      +'<div class="v2-chooser-sub">Scan the job sheet or confirmation and the details fill themselves in.</div>'
      +'<button class="v2-big-btn v2-primary" data-act="cam">&#x1F4F7; Scan job</button>'
      +'<button class="v2-big-btn" data-act="lib">&#x1F5BC;&#xFE0F; Use a screenshot or photo</button>'
      +'<button class="v2-big-btn" data-act="manual">&#x270F;&#xFE0F; Enter manually</button>'
      +'<button class="v2-link-btn" data-act="close">Cancel</button>'
      +'</div>';
    ov.addEventListener('click',function(e){
      if(e.target===ov){closeV2Chooser();return;}
      var b=e.target.closest('[data-act]');if(!b)return;
      var act=b.getAttribute('data-act');
      closeV2Chooser();
      if(act==='cam')camIn.click();
      else if(act==='lib')libIn.click();
      else if(act==='manual')openSheet('income','');
    });
    document.body.appendChild(ov);
  }
  function closeV2Chooser(){var o=document.getElementById('v2Chooser');if(o)o.remove();}
  window.v2OpenNewJob=openNewJob;

  function startScannedJob(file){
    openSheet('income','');
    if(document.getElementById('overlay').className.indexOf('open')<0)return; // free-tier limit stopped it
    setTimeout(function(){
      var fimgEl=document.getElementById('f_img');
      if(fimgEl&&window.DataTransfer){try{var dt=new DataTransfer();dt.items.add(file);fimgEl.files=dt.files;}catch(e){}}
      ocrIncomeReceipt(file);
    },300);
  }

  // ── After saving: a new job opens its job page; anything added from a job page goes back to it ──
  var _v1DoSave=doSave;
  doSave=function(){
    var newJob=ETYP==='income'&&!EID&&!V2.returnTo;
    var topBefore=DB.income.length?DB.income[0].id:null,lenBefore=DB.income.length;
    _v1DoSave.apply(this,arguments);
    if(newJob&&DB.income.length>lenBefore&&DB.income[0].id!==topBefore){
      var it=DB.income[0];
      setTimeout(function(){openJobDetail(it.jobRef||('__'+it.id),String(it.id));},60);
    }
  };
  var _v1CloseSheet=closeSheet;
  closeSheet=function(){
    _v1CloseSheet.apply(this,arguments);
    var back=V2.returnTo;V2.returnTo=null;
    if(back)setTimeout(function(){openJobDetail(back.ref,back.id);},60);
  };

  // ── Job page: full screen, with the add buttons at the top ──
  var _v1OpenJobDetail=openJobDetail;
  openJobDetail=function(jobRef,fallbackId){
    closeV2JobPage();
    var before=document.body.lastElementChild;
    _v1OpenJobDetail(jobRef,fallbackId);
    var ov=document.body.lastElementChild;
    if(!ov||ov===before||!ov.querySelector('.jd-close'))return;
    ov.classList.add('v2-jobpage');ov.id='v2JobPage';
    var panel=ov.firstElementChild;
    var isSingleton=!jobRef||jobRef.indexOf('__')===0;
    var entries=isSingleton
      ?DB.income.filter(function(i){return String(i.id)===String(fallbackId)||'__'+i.id===jobRef;})
      :DB.income.filter(function(i){return i.jobRef===jobRef;});
    var first=entries[0]||{};
    var ref=isSingleton?'':jobRef,id=String(first.id||fallbackId||'');
    var actions=document.createElement('div');
    actions.className='v2-job-actions';
    if(!ref){
      actions.innerHTML='<div class="v2-ref-needed">'
        +'<div class="v2-ref-title">Add a job reference to link expenses to this job</div>'
        +'<div class="v2-ref-row"><input class="std-input v2-ref-input" placeholder="e.g. J-1234-AB56" autocomplete="off">'
        +'<button class="v2-ref-save">Save</button></div></div>';
    } else {
      actions.innerHTML='<button class="v2-act v2-act-scan" data-act="scan"><span class="v2-act-ic">&#x1F9FE;</span>Scan receipt</button>'
        +'<button class="v2-act v2-act-exp" data-act="exp"><span class="v2-act-ic">&#x2212;</span>Add expense</button>'
        +'<button class="v2-act v2-act-travel" data-act="travel"><span class="v2-act-ic">&#x1F686;</span>Add travel</button>'
        +'<button class="v2-act v2-act-inc" data-act="inc"><span class="v2-act-ic">&#x2B;</span>Add pay</button>';
    }
    var hdr=panel.firstElementChild;
    hdr.insertAdjacentElement('afterend',actions);
    // The old add buttons now live at the top
    ['.jd-addinc','.jd-addexp'].forEach(function(s){var b=ov.querySelector(s);if(b)b.style.display='none';});
    var closeBtn=ov.querySelector('.jd-close');
    closeBtn.innerHTML='&#x2039;';closeBtn.setAttribute('aria-label','Back to jobs');
    // Opening a form from the job page comes back here afterwards
    var editBtn=ov.querySelector('.jd-edit');
    if(editBtn)editBtn.addEventListener('click',function(){V2.returnTo={ref:jobRef,id:id};},true);

    actions.addEventListener('click',function(e){
      var b=e.target.closest('[data-act]');
      if(b){
        var act=b.getAttribute('data-act');
        if(act==='inc')addPayToJob(first,ref,id);
        else addExpenseToJob(first,ref,id,act);
        return;
      }
      if(e.target.closest('.v2-ref-save')){
        var v=actions.querySelector('.v2-ref-input').value.trim();
        if(!v){showToast('Type the job reference first');return;}
        entries.forEach(function(x){x.jobRef=v;});
        saveDB();render(CTAB);
        showToast('Job reference saved');
        openJobDetail(v,id);
      }
    });
  };
  function closeV2JobPage(){var o=document.getElementById('v2JobPage');if(o)o.remove();}

  function addPayToJob(first,ref,id){
    closeV2JobPage();
    V2.returnTo={ref:ref,id:id};
    window._incomePrefill={company:first.company||'',jobRef:ref};
    openSheet('income','');
    if(document.getElementById('overlay').className.indexOf('open')<0){V2.returnTo=null;openJobDetail(ref,id);}
  }
  function addExpenseToJob(first,ref,id,kind){
    closeV2JobPage();
    V2.returnTo={ref:ref,id:id};
    var co=first.company||'';
    var pre={company:co,jobRef:ref,date:first.date||''};
    if(kind==='travel')pre.category=getCoDefault(co,'travel')?'Travel (Reimbursed)':'Travel (Not Reimbursed)';
    window._expensePrefill=pre;
    if(kind==='scan'){
      // Same as the expense form's camera button, which reads the receipt with AI
      openSheet('expense','');
      if(document.getElementById('overlay').className.indexOf('open')<0){V2.returnTo=null;openJobDetail(ref,id);return;}
      setTimeout(function(){var f=document.getElementById('f_img');if(f)f.click();},250);
      return;
    }
    openSheet('expense','');
    if(document.getElementById('overlay').className.indexOf('open')<0){V2.returnTo=null;openJobDetail(ref,id);}
  }

  // ── Jobs home ──
  function jobKey(x){return x.jobRef?x.jobRef:'__'+x.id;}
  function buildJobs(){
    var map={},list=[];
    DB.income.forEach(function(x){
      var k=jobKey(x);
      if(!map[k]){map[k]={key:k,ref:x.jobRef||'',id:String(x.id),company:x.company,date:x.date,gross:0,exp:0,deduct:0,expCount:0,sp:'',ep:'',reg:''};list.push(map[k]);}
      var j=map[k];
      j.gross+=parseFloat(x.amount||0);
      if(x.date>j.date)j.date=x.date;
      if(!j.sp&&x.startPostcode)j.sp=x.startPostcode;
      if(!j.ep&&x.endPostcode)j.ep=x.endPostcode;
      if(!j.reg&&x.registration)j.reg=x.registration;
    });
    DB.expenses.forEach(function(e){
      if(!e.jobRef||!map[e.jobRef])return;
      var j=map[e.jobRef],a=parseFloat(e.amount||0);
      j.exp+=a;j.expCount++;
      if(!isReimbursedCat(e.category))j.deduct+=a;
    });
    list.forEach(function(j){var jm=j.ref?DB.jobs&&DB.jobs[j.ref]:null;j.status=jm&&jm.status||'';});
    list.sort(function(a,b){return a.date<b.date?1:a.date>b.date?-1:(Number(b.id)-Number(a.id));});
    return list;
  }
  function weekStart(){var d=new Date();var day=(d.getDay()+6)%7;d.setDate(d.getDate()-day);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
  function jobCardHTML(j){
    var net=j.gross-j.deduct;
    var route=(j.sp||j.ep)?htmlEsc(j.sp||'?')+' &rarr; '+htmlEsc(j.ep||'?'):'';
    return '<button class="v2-job-card" data-ref="'+htmlEsc(j.key)+'" data-id="'+htmlEsc(j.id)+'">'
      +'<div class="v2-job-top">'+cobadge(j.company)+(j.ref?'<span class="v2-job-ref">'+htmlEsc(j.ref)+'</span>':'<span class="v2-job-ref v2-muted">No job ref</span>')+jobStatusChip(j.ref)+'</div>'
      +'<div class="v2-job-mid"><span>'+fdateShort(j.date)+'</span>'+(route?'<span>'+route+'</span>':'')+(j.reg?'<span>'+htmlEsc(j.reg)+'</span>':'')+'</div>'
      +'<div class="v2-job-bot"><span class="v2-job-gross">'+money(j.gross)+'</span>'
      +'<span class="v2-job-exp">'+(j.expCount?j.expCount+' expense'+(j.expCount>1?'s':'')+' &middot; '+money(j.exp):'No expenses')+'</span>'
      +'<span class="v2-job-net">Net '+money(net)+'</span></div>'
      +'</button>';
  }
  var SHOW_ALL=false;
  function rJobsHome(){
    var pg=document.getElementById('pg0');if(!pg)return;
    var jobs=buildJobs(),ws=weekStart();
    var open=jobs.filter(function(j){return j.status==='active';});
    var rest=jobs.filter(function(j){return j.status!=='active';});
    var wk=jobs.filter(function(j){return j.date>=ws;});
    var wkNet=wk.reduce(function(s,j){return s+j.gross-j.deduct;},0);
    var shown=SHOW_ALL?rest:rest.slice(0,25);
    var name=(typeof getUserName==='function'&&getUserName())||'';
    pg.innerHTML='<div class="v2-home">'
      +'<div class="v2-home-hdr"><div><div class="v2-home-hi">'+(name?'Hi '+htmlEsc(name.split(' ')[0]):'PlateTrack')+'</div>'
      +'<div class="v2-home-week">This week: '+wk.length+' job'+(wk.length===1?'':'s')+' &middot; '+money(wkNet)+' net</div></div></div>'
      +'<div class="v2-new-job">'
      +'<div class="v2-new-job-title">Start a job</div>'
      +'<div class="v2-new-job-row">'
      +'<button class="v2-big-btn v2-primary" onclick="document.getElementById(\'v2-job-camera\').click()">&#x1F4F7; Scan job</button>'
      +'<button class="v2-big-btn" onclick="openSheet(\'income\',\'\')">&#x270F;&#xFE0F; Manual</button>'
      +'</div>'
      +'<button class="v2-link-btn" onclick="document.getElementById(\'v2-job-library\').click()">or pick a screenshot</button>'
      +'</div>'
      +(open.length?'<div class="v2-section">In progress</div>'+open.map(jobCardHTML).join(''):'')
      +'<div class="v2-section">Recent jobs</div>'
      +(jobs.length===0
        ?'<div class="empty-state"><div class="empty-state-icon">&#x1F697;</div><div class="empty-state-title">No jobs yet</div><div class="empty-state-sub">Scan your first job sheet to get started</div></div>'
        :shown.map(jobCardHTML).join('')
          +(rest.length>shown.length?'<button class="v2-link-btn v2-more" onclick="V2.showAll()">Show all '+rest.length+' jobs</button>':''))
      +'</div>';
  }
  V2.showAll=function(){SHOW_ALL=true;rJobsHome();};
  document.addEventListener('click',function(e){
    var c=e.target.closest&&e.target.closest('.v2-job-card');
    if(c)openJobDetail(c.getAttribute('data-ref'),c.getAttribute('data-id'));
  });

  relabelTabs();
  render(CTAB);
  moveTabIndicator(CTAB);
})();
