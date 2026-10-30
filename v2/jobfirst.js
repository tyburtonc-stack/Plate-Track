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
      if(at>=0)have[at]=l;else have.push(l);
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
    (legs||[]).forEach(function(l){var m=parseFloat(l.miles);if(!isNaN(m)){t+=m;any=true;}});
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
      window._incomeImgData=res.image;
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
    _v1DoSave.apply(this,arguments);
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
    legsEl.addEventListener('click',function(e){
      var b=e.target.closest('[data-leg]');if(!b)return;
      var what=b.getAttribute('data-leg'),n=parseInt(b.getAttribute('data-n'),10);
      var legs=(DB.jobs[key]&&DB.jobs[key].legs)||[];
      var ctx={key:key,ref:ref,id:id,first:first};
      if(what==='add')openAddLeg(ctx);
      else if(what==='edit')openLegEditor(ctx,n);
      else if(/^(travel|hotel)/.test(what)){
        var a=legs[n]||{},z=legs[n+1]||{};
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
        renameJob(ref,id,v);
        showToast('Job reference saved');
        openJobDetail(v,id);
      }
    });
  };
  function closeV2JobPage(){var o=document.getElementById('v2JobPage');if(o)o.remove();}

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

  // ── Legs on the job page ──
  function fmtWhen(d,t){if(!d&&!t)return '';return (d?new Date(d+'T12:00').toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short'}):'')+(t?(d?', ':'')+t:'');}
  function legsHTML(key){
    var legs=(DB.jobs[key]&&DB.jobs[key].legs)||[];
    var h='<div class="v2-legs-hdr"><span>Legs'+(legs.length?' ('+legs.length+(legsMiles(legs)?' &middot; '+legsMiles(legs)+' mi':'')+')':'')+'</span>'
      +'<button class="v2-leg-add" data-leg="add">+ Add leg</button></div>';
    if(!legs.length)return h+'<div class="v2-legs-empty">One car? You don\'t need legs. For a route with several cars, add a leg for each one.</div>';
    h+='<div class="v2-gap v2-gap-ends"><div class="v2-gap-row"><span>&#x1F6B6; Getting there'+(legs[0].fromPc?' &rarr; '+htmlEsc(legs[0].fromPc):'')+'</span><button data-leg="travel-start" data-n="0">Add travel</button></div></div>';
    legs.forEach(function(l,n){
      var sleeps=l.fromDate&&l.toDate&&l.toDate>l.fromDate;
      h+='<div class="v2-leg" role="button" tabindex="0" data-leg="edit" data-n="'+n+'">'
        +'<div class="v2-leg-top"><span class="v2-leg-n">Leg '+(n+1)+'</span>'+(l.reg?'<span class="v2-leg-reg">'+htmlEsc(l.reg)+'</span>':'')+(l.miles?'<span class="v2-leg-mi">'+htmlEsc(l.miles)+' mi</span>':'')+'</div>'
        +'<div class="v2-leg-stop"><span class="v2-dot"></span><div><div class="v2-leg-addr">'+htmlEsc(l.fromAddr||l.fromPc||'Collection')+(l.fromAddr&&l.fromPc&&l.fromAddr.indexOf(l.fromPc)<0?', '+htmlEsc(l.fromPc):'')+'</div><div class="v2-leg-when">'+fmtWhen(l.fromDate,l.fromTime)+'</div></div></div>'
        +(sleeps?'<div class="v2-gap-row v2-leg-night"><span>&#x1F319; Carryover: car kept overnight</span><button class="v2-quiet" data-leg="hotel-in" data-n="'+n+'">Add hotel</button></div>':'')
        +'<div class="v2-leg-stop"><span class="v2-dot v2-dot-end"></span><div><div class="v2-leg-addr">'+htmlEsc(l.toAddr||l.toPc||'Delivery')+(l.toAddr&&l.toPc&&l.toAddr.indexOf(l.toPc)<0?', '+htmlEsc(l.toPc):'')+'</div><div class="v2-leg-when">'+fmtWhen(l.toDate,l.toTime)+'</div></div></div>'
        +'</div>';
      var z=legs[n+1];
      if(z){
        var overnight=l.toDate&&z.fromDate&&z.fromDate>l.toDate;
        var moving=l.toPc&&z.fromPc&&l.toPc!==z.fromPc;
        if(overnight||moving){
          h+='<div class="v2-gap">';
          if(moving)h+='<div class="v2-gap-row"><span>&#x1F686; '+htmlEsc(l.toPc)+' &rarr; '+htmlEsc(z.fromPc)+'</span><button data-leg="travel" data-n="'+n+'">Add travel</button></div>';
          if(overnight)h+='<div class="v2-gap-row"><span>&#x1F319; Night away</span><button data-leg="hotel" data-n="'+n+'">Add hotel</button></div>';
          h+='</div>';
        }
      }
    });
    var last=legs[legs.length-1];
    h+='<div class="v2-gap v2-gap-ends"><div class="v2-gap-row"><span>&#x1F3E0; Getting home'+(last.toPc?' from '+htmlEsc(last.toPc):'')+'</span><button data-leg="travel-home" data-n="'+(legs.length-1)+'">Add travel</button></div></div>';
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
    var l=n>=0?legs[n]:{fromDate:prev.toDate||ctx.first.date||today()};
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
      +'<button class="v2-big-btn v2-primary" data-act="save">Save leg</button>'
      +(n>=0?'<button class="v2-big-btn v2-danger" data-act="del">Delete leg</button>':'')
      +'<button class="v2-link-btn" data-act="close">Cancel</button>'
      +'</div>';
    ov.addEventListener('click',function(e){
      if(e.target===ov){closeV2Chooser();return;}
      var b=e.target.closest('[data-act]');if(!b)return;
      var act=b.getAttribute('data-act');
      if(act==='save'){
        var v={};
        ov.querySelectorAll('[data-f]').forEach(function(inp){v[inp.getAttribute('data-f')]=inp.value.trim();});
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
    list.forEach(function(j){var jm=DB.jobs&&DB.jobs[j.key];j.status=jm&&jm.status||'';j.legs=jm&&jm.legs?jm.legs.length:0;});
    list.sort(function(a,b){return a.date<b.date?1:a.date>b.date?-1:(Number(b.id)-Number(a.id));});
    return list;
  }
  function weekStart(){var d=new Date();var day=(d.getDay()+6)%7;d.setDate(d.getDate()-day);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
  function jobCardHTML(j){
    var net=j.gross-j.deduct;
    var route=(j.sp||j.ep)?htmlEsc(j.sp||'?')+' &rarr; '+htmlEsc(j.ep||'?'):'';
    return '<button class="v2-job-card" data-ref="'+htmlEsc(j.key)+'" data-id="'+htmlEsc(j.id)+'">'
      +'<div class="v2-job-top">'+cobadge(j.company)+(j.ref?'<span class="v2-job-ref">'+htmlEsc(j.ref)+'</span>':'<span class="v2-job-ref v2-muted">No job ref</span>')+jobStatusChip(j.ref)+'</div>'
      +'<div class="v2-job-mid"><span>'+fdateShort(j.date)+'</span>'+(route?'<span>'+route+'</span>':'')+(j.legs>1?'<span>'+j.legs+' legs</span>':(j.reg?'<span>'+htmlEsc(j.reg)+'</span>':''))+'</div>'
      +'<div class="v2-job-bot"><span class="v2-job-gross">'+money(j.gross)+'</span>'
      +'<span class="v2-job-exp">'+(j.expCount?j.expCount+' expense'+(j.expCount>1?'s':'')+' &middot; '+money(j.exp):'No expenses')+'</span>'
      +'<span class="v2-job-net">Net '+money(net)+'</span></div>'
      +'</button>';
  }
  var SHOW_ALL=false;
  function rJobsHome(){
    var pg=document.getElementById('pg1');if(!pg)return;
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
      +(rest.length||!jobs.length?'<div class="v2-section">Recent jobs</div>':'')
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
