// PlateTrack v2 — job-first layout.
// build.js adds this file to a copy of index.html and publishes it at /Plate-Track/v2/.
// It only changes how the app is laid out: the data (DB, pt9, Supabase rows) is exactly the same
// as the current app, so both versions can be used side by side on the same records.
// Flow: Jobs home → New job (scan or type) → the job page → add legs, expenses and travel to that job.
// Legs (one job or route can have several cars) live in DB.jobs[key].legs, which syncs via users.job_meta;
// key is the job ref, or '__'+income id for a job without one. The current app ignores them.
(function(){
  var V2={returnTo:null,pendingLegs:null,scanToken:0};
  window.V2=V2;

  // ── Tabs: 0 = Overview (the old Home dashboard, left as it was), 1 = Jobs (the job list) ──
  rJobsOverview=function(){rJobsHome();};

  var JOBS_ICON='<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>';
  var HOME_ICON='<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>';
  function relabelTabs(){
    var t0=document.getElementById('tab0'),t1=document.getElementById('tab1');
    if(t0){t0.querySelector('.tb-icon').innerHTML=HOME_ICON;t0.querySelector('.tb-label').textContent='Overview';}
    if(t1){t1.querySelector('.tb-icon').innerHTML=JOBS_ICON;t1.querySelector('.tb-label').textContent='Jobs';}
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
  libIn.multiple=true;
  camIn.onchange=libIn.onchange=function(e){
    var files=Array.prototype.slice.call(e.target.files||[]);
    e.target.value='';
    if(files.length)startScannedJob(files);
  };
  document.body.appendChild(camIn);document.body.appendChild(libIn);

  function openNewJob(){
    closeV2Chooser();
    var ov=document.createElement('div');
    ov.className='v2-chooser';ov.id='v2Chooser';
    ov.innerHTML='<div class="v2-chooser-card" role="dialog" aria-label="New job">'
      +'<div class="v2-chooser-title">New job</div>'
      +'<div class="v2-chooser-sub">Scan the job sheet or confirmation and the details fill themselves in. For a route, pick a screenshot of each leg.</div>'
      +'<button class="v2-big-btn v2-primary" data-act="cam">&#x1F4F7; Scan job</button>'
      +'<button class="v2-big-btn" data-act="lib">&#x1F5BC;&#xFE0F; Use screenshots or photos</button>'
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

  // ── Scanning jobs and route legs ──
  function legPrompt(n){
    var coList=COMPANIES.map(function(c){return c.name;}).join(', ');
    return 'Today\'s date is '+today()+'. '+(n>1?'These '+n+' screenshots are':'This screenshot is')+' one job or route for a UK trade plate driver, from a job app, a job sheet or a delivery confirmation. '
      +'A route has one total price and several legs (tasks), one car per leg. Two layouts are common: '
      +'(a) a route card showing one task in detail ("Task 2 of 3") with a map whose label (e.g. "194 mi, 4h 46m") is THAT task\'s distance; '
      +'(b) a "Route Details" page split by day ("Day 1 of 3") listing each Task with its plate, collection address and window, "N miles driving" and the delivery address and window, '
      +'plus travel between tasks (Walk, Train, Taxi) and "Carryover" when the driver keeps the car overnight. A single job is one leg. '
      +(n>1?'Screenshots can overlap or repeat a task: list every task ONCE, combining what each screenshot shows. ':'')
      +'Return ONLY valid JSON, no markdown: {"amount":total_price_for_the_whole_job_or_route_in_GBP_or_null,'
      +'"job_ref":"job or booking reference such as J-B091-6FDF (NOT a vehicle registration plate) or null",'
      +'"company":"identify company from branding or reference format, must be exactly one of ['+coList+'] or null",'
      +'"legs":[{"task_number":number_or_null,"registration":"UK plate moved on this leg, no spaces; null if hidden or shown as NOREG",'
      +'"from_address":"collection address or null","from_postcode":"collection postcode or null","from_date":"YYYY-MM-DD or null","from_time":"HH:MM start of the collection window or null",'
      +'"to_address":"delivery address or null","to_postcode":"delivery postcode or null","to_date":"YYYY-MM-DD or null","to_time":"HH:MM start of the delivery window or null",'
      +'"miles":this_leg_driving_miles_as_number_or_null}]}. '
      +'Dates without a year are the next such date on or after today\'s date, unless clearly in the past. Postcodes uppercase UK format e.g. LU1 2AB. '
      +'miles: the map label on a route card, or on Route Details the "miles driving" for that task (add the parts together when a carryover splits it over two days). Never use the whole route\'s total miles for one leg.';
  }
  function cleanLeg(l){
    l=l||{};
    var up=function(v){return v?String(v).toUpperCase().trim():'';};
    var reg=up(l.registration).replace(/\s+/g,'');
    if(reg==='NOREG'||reg==='NULL')reg='';
    return {reg:reg,fromAddr:l.from_address||'',fromPc:up(l.from_postcode),fromDate:l.from_date||'',fromTime:l.from_time||'',
      toAddr:l.to_address||'',toPc:up(l.to_postcode),toDate:l.to_date||'',toTime:l.to_time||'',miles:l.miles!=null&&!isNaN(l.miles)?String(parseFloat(l.miles)):''};
  }
  var SCAN_BATCH=6; // screenshots per AI request (the worker takes up to 8 MB)
  function readImage(file,cb){
    compressImage(file,1200,0.75,function(blob){
      var reader=new FileReader();
      reader.onload=function(ev){cb(ev.target.result);};
      reader.onerror=function(){cb(null);};
      reader.readAsDataURL(blob);
    });
  }
  // Reads all the screenshots together in one AI request (or one per SCAN_BATCH), so a route spread
  // over several screenshots is read as a whole. done(result) gets {data, legs, image} or null.
  function scanImages(files,done){
    var urls=new Array(files.length),left=files.length;
    files.forEach(function(f,i){readImage(f,function(u){urls[i]=u;if(--left===0)send();});});
    var send=function(){
      urls=urls.filter(Boolean);
      if(!urls.length){done(null);return;}
      var batches=[];
      for(var i=0;i<urls.length;i+=SCAN_BATCH)batches.push(urls.slice(i,i+SCAN_BATCH));
      Promise.all(batches.map(function(b){
        var content=b.map(function(u){return {type:'image',source:{type:'base64',media_type:'image/jpeg',data:u.split(',')[1]}};});
        content.push({type:'text',text:legPrompt(b.length)});
        return aiFetch({max_tokens:4000,messages:[{role:'user',content:content}]})
          .then(function(r){return r.json();})
          .then(function(d){
            if(aiErrorText(d)){showToast('Scan failed: '+aiErrorText(d));return null;}
            var txt=d.content&&d.content[0]?(d.content[0].text||''):'';
            var m=txt.match(/\{[\s\S]*\}/);
            if(m)try{return JSON.parse(m[0]);}catch(e){}
            return null;
          })
          .catch(function(){return null;});
      })).then(function(parts){
        parts=parts.filter(Boolean);
        if(!parts.length){done(null);return;}
        var data={},legs=[];
        parts.forEach(function(p){
          ['amount','job_ref','company'].forEach(function(k){if(data[k]==null&&p[k]!=null&&p[k]!=='')data[k]=p[k];});
          var pl=Array.isArray(p.legs)?p.legs:(p.leg?[p.leg]:[]);
          pl.slice().sort(function(a,b){return (a.task_number||0)-(b.task_number||0);}).forEach(function(x){
            var l=cleanLeg(x);
            if(l.fromPc||l.toPc||l.reg||l.fromAddr||l.toAddr)legs=mergeLegs(legs,[l]);
          });
        });
        done({data:data,legs:legs,image:urls[0]});
      });
    };
  }
  // Adds legs, replacing one already there for the same car from the same place (a re-scan).
  function mergeLegs(have,add){
    have=(have||[]).slice();
    add.forEach(function(l){
      var at=-1;
      for(var i=0;i<have.length;i++){
        var h=have[i];
        if(h.fromPc===l.fromPc&&(h.reg&&h.reg===l.reg||!h.reg&&!l.reg&&h.toPc===l.toPc)){at=i;break;}
      }
      if(at>=0)have[at]=have[at].status==='aborted'?Object.assign({},l,{status:'aborted',abortCode:have[at].abortCode||'',abortReason:have[at].abortReason||''}):l;else have.push(l);
    });
    return sortLegs(have);
  }
  function sortLegs(legs){
    return legs.map(function(l,i){return {l:l,i:i};}).sort(function(a,b){
      var ka=(a.l.fromDate||'')+(a.l.fromTime||''),kb=(b.l.fromDate||'')+(b.l.fromTime||'');
      if(ka&&kb&&ka!==kb)return ka<kb?-1:1;
      return a.i-b.i;
    }).map(function(x){return x.l;});
  }
  function legsMiles(legs){
    var t=0,any=false;
    (legs||[]).forEach(function(l){if(l.status==='aborted')return;var m=parseFloat(l.miles);if(!isNaN(m)){t+=m;any=true;}});
    return any?String(Math.round(t*10)/10):'';
  }

  function startScannedJob(files){
    openSheet('income','');
    if(document.getElementById('overlay').className.indexOf('open')<0)return; // free-tier limit stopped it
    var token=++V2.scanToken;
    var fimgEl=document.getElementById('f_img');
    if(fimgEl&&window.DataTransfer){try{var dt=new DataTransfer();dt.items.add(files[0]);fimgEl.files=dt.files;}catch(e){}}
    var st=document.getElementById('ocr-status');if(st)st.textContent='Scanning…';
    if(files.length>1)showToast('Reading '+files.length+' screenshots…');
    scanImages(files,function(res){
      if(token!==V2.scanToken)return; // form was closed meanwhile
      var st2=document.getElementById('ocr-status');if(st2)st2.textContent='';
      if(!res){showToast('Scan complete — fill in fields manually');return;}
      var legs=res.legs;
      V2.pendingLegs=legs.length?legs:null;
      var pick=function(k){var v=res.data[k];return v!=null&&v!==''?v:null;};
      var setIf=function(id,v,force){var el=document.getElementById(id);if(el&&v!=null&&v!==''&&(force||!el.value)){el.value=v;return 1;}return 0;};
      var filled=0,amt=pick('amount'),co=pick('company');
      if(amt!=null&&!isNaN(amt)){filled+=setIf('f3',parseFloat(amt).toFixed(2));updateSaveBtn();}
      if(legs.length){
        filled+=setIf('f1',legs[0].fromDate,true);
        filled+=setIf('f_reg',legs[0].reg);
        filled+=setIf('f_sp',legs[0].fromPc);
        filled+=setIf('f_ep',legs[legs.length-1].toPc);
        filled+=setIf('f5',legsMiles(legs));
        var times=legs[0].fromTime;if(times)filled+=setIf('f_start',times);
      }
      filled+=setIf('f4',pick('job_ref'));
      if(co){document.querySelectorAll('.co-chips .co-chip').forEach(function(b){if(b.textContent.trim()===co){b.click();filled++;}});}
      showToast(filled?'Job scanned — '+filled+' field'+(filled>1?'s':'')+' filled'+(legs.length>1?', '+legs.length+' legs':''):'Scan complete — fill in fields manually');
    });
  }

  // ── After saving: a new job opens its job page; anything added from a job page goes back to it ──
  var _v1DoSave=doSave;
  doSave=function(){
    var newJob=ETYP==='income'&&!EID&&!V2.returnTo,pending=V2.pendingLegs;
    var topBefore=DB.income.length?DB.income[0].id:null,lenBefore=DB.income.length;
    // Job screenshots are only needed to read the details. Kept in the job record they filled up the
    // phone's storage (they are never uploaded), so v2 doesn't save them.
    if(ETYP==='income')window._incomeImgData=null;
    var editing=ETYP==='income'&&EID?findIncome(EID):null,oldRef=editing?(editing.jobRef||''):null,editId=EID;
    _v1DoSave.apply(this,arguments);
    if(editing){var now=findIncome(editId);if(now&&(now.jobRef||'')!==oldRef)jobRefChanged(oldRef,now.jobRef||'',editId);}
    if(newJob&&DB.income.length>lenBefore&&DB.income[0].id!==topBefore){
      var it=DB.income[0];
      if(pending){var jm=jobMeta(it.jobRef||('__'+it.id));jm.legs=mergeLegs(jm.legs,pending);saveDB();}
      setTimeout(function(){openJobDetail(it.jobRef||('__'+it.id),String(it.id));},60);
    }
  };
  var _v1CloseSheet=closeSheet;
  closeSheet=function(){
    _v1CloseSheet.apply(this,arguments);
    V2.pendingLegs=null;V2.scanToken++;
    var back=V2.returnTo;V2.returnTo=null;
    if(back)setTimeout(function(){openJobDetail(back.ref,back.id);},60); // openJobDetail follows a ref changed in the form

  };

  // ── Job page: full screen, with the add buttons at the top ──
  var _v1OpenJobDetail=openJobDetail;
  openJobDetail=function(jobRef,fallbackId){
    closeV2JobPage();
    var ent0=fallbackId?findIncome(fallbackId):null;
    if(ent0&&(!jobRef||jobRef.indexOf('__')===0||!DB.income.some(function(i){return i.jobRef===jobRef;})))jobRef=ent0.jobRef||('__'+ent0.id);
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
    actions.innerHTML='<button class="v2-act v2-act-scan" data-act="scan"><span class="v2-act-ic">&#x1F9FE;</span>Scan receipt</button>'
      +'<button class="v2-act v2-act-exp" data-act="exp"><span class="v2-act-ic">&#x2212;</span>Add expense</button>'
      +'<button class="v2-act v2-act-travel" data-act="travel"><span class="v2-act-ic">&#x1F686;</span>Add travel</button>'
      +'<button class="v2-act v2-act-inc" data-act="inc"><span class="v2-act-ic">&#x2B;</span>Add pay</button>'
      +(!ref||isTempRef(ref)?'<div class="v2-ref-needed">'
        +'<div class="v2-ref-title">'+(ref?'Job ref '+htmlEsc(ref)+' is temporary. Add the company\'s ref when you have it':'No job ref yet. Add the company\'s ref when you have it')+'</div>'
        +'<div class="v2-ref-row"><input class="std-input v2-ref-input" placeholder="e.g. J-1234-AB56" autocomplete="off">'
        +'<button class="v2-ref-save">Save</button></div></div>':'');
    var hdr=panel.firstElementChild;
    hdr.insertAdjacentElement('afterend',actions);
    var key=ref||('__'+id);
    var legsEl=document.createElement('div');
    legsEl.className='v2-legs';
    legsEl.innerHTML=legsHTML(key);
    var scroller=actions.nextElementSibling;
    if(scroller)scroller.insertBefore(legsEl,scroller.firstChild);
    var totalsEl=document.createElement('div');
    totalsEl.className='v2-totals';
    totalsEl.innerHTML=totalsHTML(entries,ref,key);
    if(scroller)scroller.insertBefore(totalsEl,scroller.firstChild);
    totalsEl.addEventListener('click',function(e){if(e.target.closest('[data-nudge]'))openNudgeList(ref);});
    legsEl.addEventListener('click',function(e){
      var b=e.target.closest('[data-leg]');if(!b)return;
      var what=b.getAttribute('data-leg'),n=parseInt(b.getAttribute('data-n'),10);
      var legs=(DB.jobs[key]&&DB.jobs[key].legs)||[];
      var ctx={key:key,ref:ref,id:id,first:first};
      if(what==='add')openAddLeg(ctx);
      else if(what==='edit')openLegEditor(ctx,n);
      else if(what==='abort-fee')addPayToJob(first,ref,id);
      else if(/^(travel|hotel)/.test(what)){
        var mAttr=b.getAttribute('data-m'),a=legs[n]||{},z=(mAttr!=null?legs[parseInt(mAttr,10)]:legs[n+1])||{};
        var date={'travel':z.fromDate||a.toDate,'travel-start':a.fromDate,'travel-home':a.toDate,'hotel':a.toDate,'hotel-in':a.fromDate}[what];
        addExpenseToJob(first,ref,id,what.indexOf('travel')===0?'travel':'hotel',{date:date||''});
      }
    });
    // The old add buttons now live at the top
    ['.jd-addinc','.jd-addexp'].forEach(function(s){var b=ov.querySelector(s);if(b)b.style.display='none';});
    var closeBtn=ov.querySelector('.jd-close');
    closeBtn.innerHTML='&#x2039;';closeBtn.setAttribute('aria-label','Back to jobs');
    // Opening a form from the job page comes back here afterwards
    var editBtn=ov.querySelector('.jd-edit');
    if(editBtn){
      editBtn.addEventListener('click',function(){V2.returnTo={ref:jobRef,id:id};},true);
      var copyBtn=document.createElement('button');
      copyBtn.className='v2-copy-job';copyBtn.textContent='\u2398 Copy job';
      copyBtn.addEventListener('click',function(){copyJob(first,key);});
      editBtn.insertAdjacentElement('afterend',copyBtn);
    }

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
        renameJob(ref,id,v);
        showToast('Job reference saved');
        openJobDetail(v,id);
      }
    });
  };
  function closeV2JobPage(){var o=document.getElementById('v2JobPage');if(o)o.remove();}
  function findIncome(id){for(var i=0;i<DB.income.length;i++){if(String(DB.income[i].id)===String(id))return DB.income[i];}return null;}
  // The job form changed an entry's ref: its legs and status go with it once no other entry keeps the old
  // ref, and a temporary ref's expenses follow too.
  function jobRefChanged(oldRef,newRef,id){
    var oldKey=oldRef||('__'+id),newKey=newRef||('__'+id);
    if(oldRef&&DB.income.some(function(x){return x.jobRef===oldRef;}))return;
    if(isTempRef(oldRef)&&newRef)DB.expenses.forEach(function(x){if(x.jobRef===oldRef)x.jobRef=newRef;});
    if(DB.jobs[oldKey]&&oldKey!==newKey){
      var moved=DB.jobs[oldKey],had=DB.jobs[newKey];
      DB.jobs[newKey]=Object.assign({},moved,had||{});
      DB.jobs[newKey].legs=mergeLegs(had&&had.legs,moved.legs||[]);
      delete DB.jobs[oldKey];
    }
    saveDB();render(CTAB);
  }

  // A job without a ref gets a temporary one (PT-XXXXX) the first time an expense is added, because
  // expenses link to jobs by ref. Saving the real ref later moves the job's income, expenses and legs to it.
  function isTempRef(r){return /^PT-[A-Z0-9]{5}$/.test(r||'');}
  function tempRef(){var c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',r;do{r='PT-';for(var i=0;i<5;i++)r+=c.charAt(Math.floor(Math.random()*c.length));}while(DB.income.some(function(x){return x.jobRef===r;}));return r;}
  function renameJob(oldRef,id,newRef){
    var oldKey=oldRef||('__'+id);
    DB.income.forEach(function(x){if(oldRef?x.jobRef===oldRef:String(x.id)===String(id))x.jobRef=newRef;});
    if(oldRef)DB.expenses.forEach(function(x){if(x.jobRef===oldRef)x.jobRef=newRef;});
    if(DB.jobs[oldKey]&&oldKey!==newRef){
      var moved=DB.jobs[oldKey],had=DB.jobs[newRef];
      DB.jobs[newRef]=Object.assign({},moved,had||{});
      DB.jobs[newRef].legs=mergeLegs(had&&had.legs,moved.legs||[]);
      delete DB.jobs[oldKey];
    }
    saveDB();render(CTAB);
  }

  function addPayToJob(first,ref,id){
    if(!ref){ref=tempRef();renameJob('',id,ref);}
    closeV2JobPage();
    V2.returnTo={ref:ref,id:id};
    window._incomePrefill={company:first.company||'',jobRef:ref};
    openSheet('income','');
    if(document.getElementById('overlay').className.indexOf('open')<0){V2.returnTo=null;openJobDetail(ref,id);}
  }
  function addExpenseToJob(first,ref,id,kind,extra){
    if(!ref){ref=tempRef();renameJob('',id,ref);}
    closeV2JobPage();
    V2.returnTo={ref:ref,id:id};
    var co=first.company||'';
    var pre={company:co,jobRef:ref,date:(extra&&extra.date)||first.date||''};
    if(kind==='travel')pre.category=getCoDefault(co,'travel')?'Travel (Reimbursed)':'Travel (Not Reimbursed)';
    if(kind==='hotel')pre.category=getCoDefault(co,'hotel')?'Hotel (Reimbursed)':'Hotel (Not Reimbursed)';
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

  // ── Job page totals ──
  function jobExpenses(ref){return ref?DB.expenses.filter(function(e){return e.jobRef===ref;}):[];}
  function totalsHTML(entries,ref,key){
    var gross=0;entries.forEach(function(x){gross+=parseFloat(x.amount||0);});
    var reimb=0,deduct=0;
    jobExpenses(ref).forEach(function(e){var a=parseFloat(e.amount||0);if(isReimbursedCat(e.category))reimb+=a;else deduct+=a;});
    var legs=(DB.jobs[key]&&DB.jobs[key].legs)||[];
    var miles=legsMiles(legs)||(entries[0]&&entries[0].miles)||'';
    var noRc=nudgeList(ref).length;
    var tile=function(label,val,cls,sub){return '<div class="v2-tile'+(cls?' '+cls:'')+'"><div class="v2-tile-l">'+label+'</div><div class="v2-tile-v">'+val+'</div>'+(sub?'<div class="v2-tile-s">'+sub+'</div>':'')+'</div>';};
    return '<div class="v2-tiles">'
      +tile('Pay',money(gross))
      +tile('Expenses',money(deduct),deduct?'v2-tile-orange':'',reimb?money(reimb)+' reimbursed':'')
      +tile('Net',money(gross-deduct),'v2-tile-green')
      +tile('Miles',miles?htmlEsc(String(miles)):'&mdash;','',miles&&gross?money(gross/parseFloat(miles))+'/mi':'')
      +'</div>'
      +(noRc?'<button class="v2-nudge v2-nudge-sm" data-nudge="1">&#x1F9FE; '+noRc+' expense'+(noRc>1?'s':'')+' on this job '+(noRc>1?'have':'has')+' no receipt photo</button>':'');
  }

  // ── Copy a job: same company, pay, type, route and legs; new date, no ref, no expenses ──
  function copyJob(src,key){
    var nid=newid(),copy=Object.assign({},src,{id:nid,date:today(),jobRef:'',receiptImage:''});
    DB.income.unshift(copy);
    var legs=(DB.jobs[key]&&DB.jobs[key].legs)||[];
    if(legs.length){
      jobMeta('__'+nid).legs=legs.map(function(l){var c=Object.assign({},l,{fromDate:'',toDate:''});delete c.status;delete c.abortCode;delete c.abortReason;return c;});
    }
    saveDB();render(CTAB);
    closeV2JobPage();
    showToast('\u2398 Job copied: check the date and pay');
    V2.returnTo={ref:'__'+nid,id:String(nid)};
    openSheet('income',String(nid));
  }

  // ── Delete a whole job (swipe left on the Jobs list) ──
  function deleteJob(key,id){
    var ent=findIncome(id);if(!ent)return;
    var ref=key.indexOf('__')===0?'':key;
    var rows=ref?DB.income.filter(function(x){return x.jobRef===ref;}):[ent];
    var nExp=jobExpenses(ref).length;
    swipeConfirm('Delete '+(ref?'job '+htmlEsc(ref):'this job')+'?'+(rows.length>1?'<br>'+rows.length+' pay entries go with it.':'')
      +(nExp?'<br>Its '+nExp+' expense'+(nExp>1?'s stay':' stays')+' in your Expenses list.':''),function(){
      var ids=rows.map(function(x){return String(x.id);});
      DB.income=DB.income.filter(function(x){return ids.indexOf(String(x.id))<0;});
      delete DB.jobs[key];
      clearTimeout(window._syncT);
      try{localStorage.setItem('pt9',JSON.stringify(DB));}catch(e){}
      try{sessionStorage.setItem('pt9',JSON.stringify(DB));}catch(e){}
      render(CTAB);showToast('Job deleted');
      if(SUPA_USER&&SUPA_SESSION){
        var left=ids.length;
        ids.forEach(function(rid){supaDeleteRow('income',rid,function(){if(--left===0)supaPushAll(function(){updateSyncBar();});});});
      } else if(SUPA_USER){ids.forEach(function(rid){addPendingDelete('income',rid);});}
    },'Delete job','Cancel');
  }
  // Swipe a job card left to show Delete. Vertical scrolling is left to the browser (touch-action: pan-y).
  var SW={el:null,x0:0,y0:0,dx:0,on:false,moved:false};
  function swipeClose(except){document.querySelectorAll('.v2-swipe.open').forEach(function(w){if(w!==except){w.classList.remove('open');w.querySelector('.v2-job-card').style.transform='';}});}
  document.addEventListener('pointerdown',function(e){
    var card=e.target.closest&&e.target.closest('.v2-swipe .v2-job-card');
    if(!card){if(!(e.target.closest&&e.target.closest('.v2-swipe-del')))swipeClose();return;}
    SW={el:card,x0:e.clientX,y0:e.clientY,dx:0,on:false,moved:false,open:card.parentNode.classList.contains('open')};
  });
  document.addEventListener('pointermove',function(e){
    if(!SW.el)return;
    var dx=e.clientX-SW.x0,dy=e.clientY-SW.y0;
    if(!SW.on){if(Math.abs(dx)>8&&Math.abs(dx)>Math.abs(dy)){SW.on=true;SW.moved=true;swipeClose(SW.el.parentNode);}else if(Math.abs(dy)>8){SW.el=null;return;}else return;}
    var x=Math.max(-96,Math.min(0,dx+(SW.open?-88:0)));
    SW.dx=x;SW.el.parentNode.classList.add('swiping');SW.el.style.transition='none';SW.el.style.transform='translateX('+x+'px)';
  });
  document.addEventListener('pointerup',function(){
    if(!SW.el)return;
    var el=SW.el,w=el.parentNode;SW.el=null;w.classList.remove('swiping');
    el.style.transition='';
    if(!SW.on)return;
    var open=SW.dx<-44;
    w.classList.toggle('open',open);el.style.transform=open?'translateX(-88px)':'';
  });
  document.addEventListener('pointercancel',function(){if(SW.el){SW.el.style.transform='';SW.el=null;}});

  // ── Missing receipt nudge: expenses of £10 or more this tax year with no photo ──
  var NUDGE_MIN=10;
  function nudgeDismissed(){try{return JSON.parse(localStorage.getItem('pt_nudge_dismissed')||'[]');}catch(e){return [];}}
  function nudgeList(ref){
    var ty=tyear(today()),off=nudgeDismissed();
    return DB.expenses.filter(function(e){
      return parseFloat(e.amount||0)>=NUDGE_MIN&&!e.receiptImage&&tyear(e.date)===ty&&off.indexOf(String(e.id))<0&&(ref===undefined||e.jobRef===ref&&ref);
    }).sort(function(a,b){return a.date<b.date?1:-1;});
  }
  function openNudgeList(ref){
    closeV2Chooser();
    var list=nudgeList(ref);
    if(!list.length){showToast('All receipts are in');return;}
    var ov=document.createElement('div');
    ov.className='v2-chooser';ov.id='v2Chooser';
    ov.innerHTML='<div class="v2-chooser-card v2-leg-editor" role="dialog" aria-label="Missing receipts">'
      +'<div class="v2-chooser-title">Missing receipts</div>'
      +'<div class="v2-chooser-sub">Expenses of &pound;'+NUDGE_MIN+' or more this tax year with no photo. HMRC can ask to see receipts for up to 5 years after the tax return deadline.</div>'
      +list.map(function(e){
        return '<div class="v2-nudge-row"><div><div class="v2-nudge-cat">'+htmlEsc(e.category||'Expense')+' &middot; '+money(e.amount)+'</div>'
          +'<div class="v2-nudge-sub">'+fdateShort(e.date)+(e.jobRef?' &middot; '+htmlEsc(e.jobRef):'')+(e.description?' &middot; '+htmlEsc(e.description):'')+'</div></div>'
          +'<div class="v2-nudge-btns"><button data-photo="'+htmlEsc(String(e.id))+'">Add photo</button><button class="v2-quiet" data-skip="'+htmlEsc(String(e.id))+'">No receipt</button></div></div>';
      }).join('')
      +'<button class="v2-link-btn" data-act="close">Close</button></div>';
    ov.addEventListener('click',function(e){
      if(e.target===ov||e.target.closest('[data-act="close"]')){closeV2Chooser();return;}
      var ph=e.target.closest('[data-photo]'),sk=e.target.closest('[data-skip]');
      if(ph){
        closeV2Chooser();
        var eid=ph.getAttribute('data-photo');
        openSheet('expense',eid);
        setTimeout(function(){var f=document.getElementById('f_img');if(f)f.click();},250);
      } else if(sk){
        var off=nudgeDismissed();off.push(sk.getAttribute('data-skip'));
        try{localStorage.setItem('pt_nudge_dismissed',JSON.stringify(off));}catch(er){}
        sk.closest('.v2-nudge-row').remove();
        render(CTAB);
        if(!ov.querySelector('.v2-nudge-row'))closeV2Chooser();
      }
    });
    document.body.appendChild(ov);
  }
  V2.openNudgeList=openNudgeList;

  // ── Legs on the job page ──
  function fmtWhen(d,t){if(!d&&!t)return '';return (d?new Date(d+'T12:00').toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short'}):'')+(t?(d?', ':'')+t:'');}
  function legsHTML(key){
    var legs=(DB.jobs[key]&&DB.jobs[key].legs)||[];
    var act=[];legs.forEach(function(l,i){if(l.status!=='aborted')act.push(i);});
    var nAb=legs.length-act.length;
    var h='<div class="v2-legs-hdr"><span>Legs'+(legs.length?' ('+act.length+(legsMiles(legs)?' &middot; '+legsMiles(legs)+' mi':'')+(nAb?' &middot; '+nAb+' aborted':'')+')':'')+'</span>'
      +'<button class="v2-leg-add" data-leg="add">+ Add leg</button></div>';
    if(!legs.length)return h+'<div class="v2-legs-empty">One car? You don\'t need legs. For a route with several cars, add a leg for each one.</div>';
    var first=act.length?legs[act[0]]:null,last=act.length?legs[act[act.length-1]]:null;
    if(first)h+='<div class="v2-gap v2-gap-ends"><div class="v2-gap-row"><span>&#x1F6B6; Getting there'+(first.fromPc?' &rarr; '+htmlEsc(first.fromPc):'')+'</span><button data-leg="travel-start" data-n="'+act[0]+'">Add travel</button></div></div>';
    legs.forEach(function(l,n){
      var ab=l.status==='aborted';
      var sleeps=!ab&&l.fromDate&&l.toDate&&l.toDate>l.fromDate;
      h+='<div class="v2-leg'+(ab?' v2-leg-aborted':'')+'" role="button" tabindex="0" data-leg="edit" data-n="'+n+'">'
        +'<div class="v2-leg-top"><span class="v2-leg-n">Leg '+(n+1)+'</span>'+(l.reg?'<span class="v2-leg-reg">'+htmlEsc(l.reg)+'</span>':'')+(ab?'<span class="v2-leg-badge">&#x2715; Aborted</span>':'')+(l.miles?'<span class="v2-leg-mi">'+htmlEsc(l.miles)+' mi</span>':'')+'</div>'
        +'<div class="v2-leg-stop"><span class="v2-dot"></span><div><div class="v2-leg-addr">'+htmlEsc(l.fromAddr||l.fromPc||'Collection')+(l.fromAddr&&l.fromPc&&l.fromAddr.indexOf(l.fromPc)<0?', '+htmlEsc(l.fromPc):'')+'</div><div class="v2-leg-when">'+fmtWhen(l.fromDate,l.fromTime)+'</div></div></div>'
        +(sleeps?'<div class="v2-gap-row v2-leg-night"><span>&#x1F319; Carryover: car kept overnight</span><button class="v2-quiet" data-leg="hotel-in" data-n="'+n+'">Add hotel</button></div>':'')
        +'<div class="v2-leg-stop"><span class="v2-dot v2-dot-end"></span><div><div class="v2-leg-addr">'+htmlEsc(l.toAddr||l.toPc||'Delivery')+(l.toAddr&&l.toPc&&l.toAddr.indexOf(l.toPc)<0?', '+htmlEsc(l.toPc):'')+'</div><div class="v2-leg-when">'+fmtWhen(l.toDate,l.toTime)+'</div></div></div>'
        +(ab?'<div class="v2-leg-abort-info">'+((l.abortCode||l.abortReason)?(l.abortCode?'Code '+htmlEsc(l.abortCode):'')+(l.abortCode&&l.abortReason?' &mdash; ':'')+htmlEsc(l.abortReason||''):'No code or reason added')
          +'<button data-leg="abort-fee" data-n="'+n+'">Add abort fee</button></div>':'')
        +'</div>';
      var ai=act.indexOf(n),z=ai>=0&&ai<act.length-1?legs[act[ai+1]]:null;
      if(z){
        var overnight=l.toDate&&z.fromDate&&z.fromDate>l.toDate;
        var moving=l.toPc&&z.fromPc&&l.toPc!==z.fromPc;
        if(overnight||moving){
          var m=act[ai+1];
          h+='<div class="v2-gap">';
          if(moving)h+='<div class="v2-gap-row"><span>&#x1F686; '+htmlEsc(l.toPc)+' &rarr; '+htmlEsc(z.fromPc)+'</span><button data-leg="travel" data-n="'+n+'" data-m="'+m+'">Add travel</button></div>';
          if(overnight)h+='<div class="v2-gap-row"><span>&#x1F319; Night away</span><button data-leg="hotel" data-n="'+n+'" data-m="'+m+'">Add hotel</button></div>';
          h+='</div>';
        }
      }
    });
    if(last)h+='<div class="v2-gap v2-gap-ends"><div class="v2-gap-row"><span>&#x1F3E0; Getting home'+(last.toPc?' from '+htmlEsc(last.toPc):'')+'</span><button data-leg="travel-home" data-n="'+act[act.length-1]+'">Add travel</button></div></div>';
    return h;
  }
  // Keeps the job's own miles in step with its legs, unless it was typed in separately.
  function saveLegs(ctx,legs){
    var jm=jobMeta(ctx.key),before=legsMiles(jm.legs);
    jm.legs=sortLegs(legs);
    var after=legsMiles(jm.legs),ent=null;
    for(var i=0;i<DB.income.length;i++){if(String(DB.income[i].id)===String(ctx.id)){ent=DB.income[i];break;}}
    if(ent&&after&&(!ent.miles||String(ent.miles)===before))ent.miles=after;
    saveDB();render(CTAB);
  }

  var legCam=document.createElement('input'),legLib=document.createElement('input');
  legCam.type=legLib.type='file';
  legCam.accept=legLib.accept='image/*,.heic,.heif';
  legCam.setAttribute('capture','environment');
  legLib.multiple=true;
  legCam.style.display=legLib.style.display='none';
  legCam.id='v2-leg-camera';legLib.id='v2-leg-library';
  legCam.onchange=legLib.onchange=function(e){
    var files=Array.prototype.slice.call(e.target.files||[]),ctx=V2.legCtx;
    e.target.value='';
    if(!files.length||!ctx)return;
    showToast('Reading '+(files.length>1?files.length+' screenshots':'leg')+'…');
    scanImages(files,function(res){
      var legs=res?res.legs:[];
      if(!legs.length){showToast('No legs found — add them manually');return;}
      saveLegs(ctx,mergeLegs((DB.jobs[ctx.key]&&DB.jobs[ctx.key].legs)||[],legs));
      showToast(legs.length+' leg'+(legs.length>1?'s':'')+' added');
      openJobDetail(ctx.ref||ctx.key,ctx.id);
    });
  };
  document.body.appendChild(legCam);document.body.appendChild(legLib);

  function openAddLeg(ctx){
    closeV2Chooser();
    V2.legCtx=ctx;
    var ov=document.createElement('div');
    ov.className='v2-chooser';ov.id='v2Chooser';
    ov.innerHTML='<div class="v2-chooser-card" role="dialog" aria-label="Add leg">'
      +'<div class="v2-chooser-title">Add leg</div>'
      +'<div class="v2-chooser-sub">Pick a screenshot of each leg (e.g. Task 1, 2 and 3) and they\'re added in order.</div>'
      +'<button class="v2-big-btn v2-primary" data-act="lib">&#x1F5BC;&#xFE0F; Choose screenshots</button>'
      +'<button class="v2-big-btn" data-act="cam">&#x1F4F7; Take a photo</button>'
      +'<button class="v2-big-btn" data-act="manual">&#x270F;&#xFE0F; Enter manually</button>'
      +'<button class="v2-link-btn" data-act="close">Cancel</button>'
      +'</div>';
    ov.addEventListener('click',function(e){
      if(e.target===ov){closeV2Chooser();return;}
      var b=e.target.closest('[data-act]');if(!b)return;
      var act=b.getAttribute('data-act');
      closeV2Chooser();
      if(act==='cam')legCam.click();
      else if(act==='lib')legLib.click();
      else if(act==='manual')openLegEditor(ctx,-1);
    });
    document.body.appendChild(ov);
  }

  var LEG_FIELDS=[['reg','Registration','text','KJ25LTT'],['fromAddr','Collect from','text','Address'],['fromPc','Postcode','text','CV6 5SL'],['fromDate','Date','date',''],['fromTime','Time','time',''],
    ['toAddr','Deliver to','text','Address'],['toPc','Postcode','text','ST18 0RB'],['toDate','Date','date',''],['toTime','Time','time',''],['miles','Miles','number','0']];
  function openLegEditor(ctx,n){
    closeV2Chooser();
    var legs=((DB.jobs[ctx.key]&&DB.jobs[ctx.key].legs)||[]).slice();
    var prev=legs[legs.length-1]||{};
    var l=n>=0?legs[n]:{fromDate:prev.toDate||ctx.first.date||today()},isAb=l.status==='aborted';
    var field=function(f){
      return '<label class="v2-lf"><span>'+f[1]+'</span><input class="std-input" data-f="'+f[0]+'" type="'+f[2]+'" placeholder="'+f[3]+'" value="'+htmlEsc(l[f[0]]||'')+'"'+(f[2]==='number'?' inputmode="decimal"':'')+(f[0]==='reg'||/Pc$/.test(f[0])?' style="text-transform:uppercase"':'')+'></label>';
    };
    var byKey={};LEG_FIELDS.forEach(function(f){byKey[f[0]]=f;});
    var row=function(keys){return '<div class="v2-lf-row">'+keys.map(function(k){return field(byKey[k]);}).join('')+'</div>';};
    var ov=document.createElement('div');
    ov.className='v2-chooser';ov.id='v2Chooser';
    ov.innerHTML='<div class="v2-chooser-card v2-leg-editor" role="dialog" aria-label="Leg">'
      +'<div class="v2-chooser-title">'+(n>=0?'Leg '+(n+1):'New leg')+'</div>'
      +row(['reg','miles'])
      +'<div class="v2-lf-group">Collection</div>'+field(byKey.fromAddr)+row(['fromPc','fromDate','fromTime'])
      +'<div class="v2-lf-group">Delivery</div>'+field(byKey.toAddr)+row(['toPc','toDate','toTime'])
      +(n>=0?'<div class="v2-lf-group">'+(isAb?'&#x2715; This leg is aborted':'Abort or cancel this leg')+'</div>'
        +'<div class="v2-lf-row"><label class="v2-lf"><span>Abort code</span><input class="std-input" data-f="abortCode" placeholder="e.g. CXL12345" value="'+htmlEsc(l.abortCode||'')+'"></label></div>'
        +'<label class="v2-lf"><span>Reason</span><input class="std-input" data-f="abortReason" placeholder="e.g. Vehicle not at site" value="'+htmlEsc(l.abortReason||'')+'"></label>'
        +(isAb?'<button class="v2-big-btn" data-act="reinstate">&#x21BA; Reinstate leg</button>'
               :'<button class="v2-big-btn v2-danger" data-act="abort">&#x2715; Abort this leg</button>'):'')
      +'<button class="v2-big-btn v2-primary" data-act="save">Save leg</button>'
      +(n>=0?'<button class="v2-link-btn v2-del" data-act="del">Delete leg</button>':'')
      +'<button class="v2-link-btn" data-act="close">Cancel</button>'
      +'</div>';
    ov.addEventListener('click',function(e){
      if(e.target===ov){closeV2Chooser();return;}
      var b=e.target.closest('[data-act]');if(!b)return;
      var act=b.getAttribute('data-act');
      if(act==='save'||act==='abort'||act==='reinstate'){
        var v={};
        ov.querySelectorAll('[data-f]').forEach(function(inp){v[inp.getAttribute('data-f')]=inp.value.trim();});
        if(act==='abort'||(act==='save'&&isAb))v.status='aborted';
        if(act==='reinstate'){delete v.abortCode;delete v.abortReason;}
        if(act==='abort')showToast('Leg aborted. The rest of the job carries on');
        v.reg=v.reg.toUpperCase().replace(/\s+/g,'');v.fromPc=v.fromPc.toUpperCase();v.toPc=v.toPc.toUpperCase();
        if(!v.reg&&!v.fromPc&&!v.toPc&&!v.fromAddr&&!v.toAddr){showToast('Add a registration or an address');return;}
        if(n>=0)legs[n]=v;else legs.push(v);
        closeV2Chooser();saveLegs(ctx,legs);openJobDetail(ctx.ref||ctx.key,ctx.id);
      } else if(act==='del'){
        legs.splice(n,1);
        closeV2Chooser();saveLegs(ctx,legs);openJobDetail(ctx.ref||ctx.key,ctx.id);
      } else closeV2Chooser();
    });
    document.body.appendChild(ov);
  }

  // ── Jobs home ──
  function jobKey(x){return x.jobRef?x.jobRef:'__'+x.id;}
  function buildJobs(){
    var map={},list=[];
    DB.income.forEach(function(x){
      var k=jobKey(x);
      if(!map[k]){map[k]={key:k,ref:x.jobRef||'',id:String(x.id),company:x.company,date:x.date,gross:0,exp:0,deduct:0,reimb:0,expCount:0,sp:'',ep:'',reg:''};list.push(map[k]);}
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
      if(isReimbursedCat(e.category))j.reimb+=a;else j.deduct+=a;
    });
    list.forEach(function(j){var jm=DB.jobs&&DB.jobs[j.key];j.status=jm&&jm.status||'';var lg=jm&&jm.legs||[];j.abortedLegs=lg.filter(function(l){return l.status==='aborted';}).length;j.legs=lg.length-j.abortedLegs;});
    list.sort(function(a,b){return a.date<b.date?1:a.date>b.date?-1:(Number(b.id)-Number(a.id));});
    return list;
  }
  function jobCardHTML(j){
    var net=j.gross-j.deduct;
    var route=(j.sp||j.ep)?htmlEsc(j.sp||'?')+' &rarr; '+htmlEsc(j.ep||'?'):'';
    return '<div class="v2-swipe"><button class="v2-swipe-del" data-del-ref="'+htmlEsc(j.key)+'" data-del-id="'+htmlEsc(j.id)+'" aria-label="Delete job">Delete</button>'
      +'<button class="v2-job-card" data-ref="'+htmlEsc(j.key)+'" data-id="'+htmlEsc(j.id)+'">'
      +'<div class="v2-job-top">'+cobadge(j.company)+(j.ref?'<span class="v2-job-ref">'+htmlEsc(j.ref)+'</span>':'<span class="v2-job-ref v2-muted">No job ref</span>')+jobStatusChip(j.ref)+'</div>'
      +'<div class="v2-job-mid"><span>'+fdateShort(j.date)+'</span>'+(route?'<span>'+route+'</span>':'')+(j.legs>1||j.abortedLegs?'<span>'+j.legs+' leg'+(j.legs===1?'':'s')+'</span>':(j.reg?'<span>'+htmlEsc(j.reg)+'</span>':''))+(j.abortedLegs?'<span class="v2-job-ab">'+j.abortedLegs+' aborted</span>':'')+'</div>'
      +'<div class="v2-job-bot"><span class="v2-job-gross">'+money(j.gross)+'</span>'
      +'<span class="v2-job-exp">'+(j.expCount?'':'No expenses')+'</span>'
      +'<span class="v2-job-net">Net '+money(net)+'</span></div>'
      +(j.expCount?'<div class="v2-pills">'+(j.deduct?'<span class="v2-pill v2-pill-exp">&#x1F9FE; '+money(j.deduct)+' exp.</span>':'')+(j.reimb?'<span class="v2-pill v2-pill-reimb">&#x2B50; '+money(j.reimb)+' reimb.</span>':'')+'</div>':'')
      +'</button></div>';
  }
  var SHOW_ALL=false;
  function rJobsHome(){
    var pg=document.getElementById('pg1');if(!pg)return;
    var jobs=buildJobs();
    var open=jobs.filter(function(j){return j.status==='active';});
    var rest=jobs.filter(function(j){return j.status!=='active';});
    var shown=SHOW_ALL?rest:rest.slice(0,25);
    var noRc=nudgeList().length;
    pg.innerHTML='<div class="v2-home">'
      +'<div class="tab-hdr v2-jobs-hdr"><span class="tab-hdr-title">Jobs</span></div>'
      +(noRc?'<button class="v2-nudge" onclick="V2.openNudgeList()">&#x1F9FE; '+noRc+' expense'+(noRc>1?'s':'')+' over &pound;'+NUDGE_MIN+' '+(noRc>1?'have':'has')+' no receipt photo<span>Add &rsaquo;</span></button>':'')
      +'<div class="v2-new-job">'
      +'<div class="v2-new-job-title">Start a job</div>'
      +'<div class="v2-new-job-row">'
      +'<button class="v2-big-btn v2-primary" onclick="document.getElementById(\'v2-job-camera\').click()">&#x1F4F7; Scan job</button>'
      +'<button class="v2-big-btn" onclick="openSheet(\'income\',\'\')">&#x270F;&#xFE0F; Manual</button>'
      +'</div>'
      +'<button class="v2-link-btn" onclick="document.getElementById(\'v2-job-library\').click()">or pick a screenshot</button>'
      +'</div>'
      +(open.length?'<div class="v2-section">In progress</div>'+open.map(jobCardHTML).join(''):'')
      +(rest.length||!jobs.length?'<div class="v2-section">Recent jobs</div>':'')
      +(jobs.length===0
        ?'<div class="empty-state"><div class="empty-state-icon">&#x1F697;</div><div class="empty-state-title">No jobs yet</div><div class="empty-state-sub">Scan your first job sheet to get started</div></div>'
        :shown.map(jobCardHTML).join('')
          +(rest.length>shown.length?'<button class="v2-link-btn v2-more" onclick="V2.showAll()">Show all '+rest.length+' jobs</button>':''))
      +'</div>';
  }
  V2.showAll=function(){SHOW_ALL=true;rJobsHome();};
  document.addEventListener('click',function(e){
    var d=e.target.closest&&e.target.closest('.v2-swipe-del');
    if(d){deleteJob(d.getAttribute('data-del-ref'),d.getAttribute('data-del-id'));return;}
    var c=e.target.closest&&e.target.closest('.v2-job-card');
    if(!c)return;
    if(SW.moved){SW.moved=false;return;} // end of a swipe, not a tap
    if(c.parentNode.classList.contains('open')){swipeClose();return;}
    openJobDetail(c.getAttribute('data-ref'),c.getAttribute('data-id'));
  });

  relabelTabs();
  render(CTAB);
  moveTabIndicator(CTAB);
})();
