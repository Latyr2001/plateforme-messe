// ---------------------------------------------------------------
// Supabase connection
// ---------------------------------------------------------------
const SUPABASE_URL = "https://irsugdjotbumcuvzxdwn.supabase.co";
const SUPABASE_KEY = "sb_publishable_3fj8r5ijfyhD7rPQGVMwTg__fi1IF3x";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const TABLE = "demandes_messe";

// ---------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------
const MONTHS_FR = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
const DAYS_FR = ["dimanche","lundi","mardi","mercredi","jeudi","vendredi","samedi"];
function toISO(d){ return d.toISOString().slice(0,10); }
function fmtLong(iso){
  const d = new Date(iso+"T00:00:00");
  return `${DAYS_FR[d.getDay()]} ${d.getDate()} ${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`;
}
function fmtShort(iso){
  const [y,m,d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function capitalize(s){ return s.charAt(0).toUpperCase()+s.slice(1); }

const TODAY = new Date();
const TODAY_ISO = toISO(TODAY);

// ---------------------------------------------------------------
// State (loaded from Supabase)
// ---------------------------------------------------------------
let requests = [];
let searchTerm = "";
let selectedPrintDate = TODAY_ISO;

// ---------------------------------------------------------------
// Elements
// ---------------------------------------------------------------
const tableBody = document.getElementById('tableBody');
const tableBodyFull = document.getElementById('tableBodyFull');
const dashDateSelect = document.getElementById('dashDateSelect');
const sideDateSelect = document.getElementById('sideDateSelect');
const sheetBody = document.getElementById('sheetBody');
const sheetDate = document.getElementById('sheetDate');

function badgeFor(etat){
  if(etat==="Validée") return `<span class="badge badge-valid">Validée</span>`;
  if(etat==="Non validée") return `<span class="badge badge-invalid">Non validée</span>`;
  return `<span class="badge badge-pending">En attente</span>`;
}
function fmtMoney(n){ return n.toLocaleString('fr-FR'); }
function escapeHtml(s){
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function mapRow(row){
  return {
    id: row.id,
    demandePar: row.demande_par,
    intention: row.intention,
    dateDeclaration: row.date_declaration,
    dateMesse: row.date_messe,
    montant: row.montant,
    etat: row.etat,
  };
}

async function loadRequests(){
  const { data, error } = await sb
    .from(TABLE)
    .select('*')
    .order('date_declaration', { ascending: false });

  if(error){
    console.error(error);
    showToast("Erreur de chargement : " + error.message);
    return;
  }
  requests = (data || []).map(mapRow);
  renderAll();
}

function renderStats(){
  document.getElementById('statTotal').textContent = requests.length;
  document.getElementById('statValidated').textContent = requests.filter(r=>r.etat==="Validée").length;
  document.getElementById('statReceived').textContent = requests.length;
  document.getElementById('statPending').textContent = requests.filter(r=>r.etat==="En attente").length;
  document.getElementById('todayLabel').textContent = capitalize(fmtLong(TODAY_ISO));
}

function matchesSearch(r, term){
  if(!term) return true;
  const t = term.toLowerCase();
  return r.demandePar.toLowerCase().includes(t) || r.intention.toLowerCase().includes(t);
}

function renderTable(targetEl, term){
  const list = requests
    .filter(r=>matchesSearch(r, term))
    .sort((a,b)=> b.dateDeclaration.localeCompare(a.dateDeclaration));
  if(list.length===0){
    targetEl.innerHTML = `<tr><td colspan="7"><div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg><p>Aucune demande trouvée.</p></div></td></tr>`;
    return;
  }
  targetEl.innerHTML = list.map((r,i)=>`
    <tr>
      <td class="col-num">${i+1}</td>
      <td>${escapeHtml(r.intention)}</td>
      <td>${escapeHtml(r.demandePar)}</td>
      <td>${fmtShort(r.dateDeclaration)}</td>
      <td class="col-amount">${fmtMoney(r.montant)}</td>
      <td>${badgeFor(r.etat)}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" title="Voir" onclick="viewDetail(${r.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg></button>
          <button class="icon-btn" title="Modifier" onclick="openEdit(${r.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
          <button class="icon-btn" title="Imprimer" onclick="printSingle(${r.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg></button>
        </div>
      </td>
    </tr>
  `).join('');
}

function allMassDates(){
  const set = new Set(requests.map(r=>r.dateMesse));
  return Array.from(set).sort();
}
function populateDateSelects(){
  const dates = allMassDates();
  if(!dates.includes(selectedPrintDate)) dates.push(selectedPrintDate);
  dates.sort();
  const opts = dates.map(dt=>`<option value="${dt}" ${dt===selectedPrintDate?'selected':''}>${capitalize(fmtLong(dt))}</option>`).join('');
  dashDateSelect.innerHTML = opts;
  sideDateSelect.innerHTML = opts;
}

function renderSheet(){
  const list = requests.filter(r=>r.dateMesse===selectedPrintDate);
  sheetDate.textContent = capitalize(fmtLong(selectedPrintDate));
  if(list.length===0){
    sheetBody.innerHTML = `<tr><td colspan="3" class="empty-print">Aucune intention enregistrée pour cette date.</td></tr>`;
    return;
  }
  sheetBody.innerHTML = list.map((r,i)=>`
    <tr><td>${i+1}</td><td class="name">${escapeHtml(r.intention)}</td><td>${escapeHtml(r.demandePar)}</td></tr>
  `).join('');
}

function renderToday(){
  const list = requests.filter(r=>r.dateMesse===TODAY_ISO);
  document.getElementById('todaySub').textContent = `${capitalize(fmtLong(TODAY_ISO))} — ${list.length} intention${list.length>1?'s':''} enregistrée${list.length>1?'s':''}.`;
  document.getElementById('sheetDateToday').textContent = capitalize(fmtLong(TODAY_ISO));
  const body = document.getElementById('sheetBodyToday');
  if(list.length===0){
    body.innerHTML = `<tr><td colspan="3" class="empty-print">Aucune intention enregistrée pour aujourd'hui.</td></tr>`;
    return;
  }
  body.innerHTML = list.map((r,i)=>`<tr><td>${i+1}</td><td class="name">${escapeHtml(r.intention)}</td><td>${escapeHtml(r.demandePar)}</td></tr>`).join('');
}

function renderAll(){
  renderStats();
  renderTable(tableBody, searchTerm);
  renderTable(tableBodyFull, document.getElementById('searchInputFull').value);
  populateDateSelects();
  renderSheet();
  renderToday();
}

const viewIds = ['accueil','nouvelle','registre','imprimer','export','parametres'];
document.querySelectorAll('.nav-item').forEach(item=>{
  item.addEventListener('click', ()=>{
    document.querySelectorAll('.nav-item').forEach(i=>i.classList.remove('active'));
    const view = item.dataset.view;
    document.querySelectorAll(`.nav-item[data-view="${view}"]`).forEach(i=>i.classList.add('active'));
    viewIds.forEach(v=>document.getElementById('view-'+v).classList.remove('active'));
    document.getElementById('view-'+view).classList.add('active');
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarBackdrop').classList.remove('open');
    window.scrollTo({top:0, behavior:'smooth'});
  });
});

document.getElementById('heroNewRequestBtn').addEventListener('click', ()=>{
  document.querySelector('.nav-item[data-view="nouvelle"]').click();
});

document.getElementById('hamburgerBtn').addEventListener('click', ()=>{
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarBackdrop').classList.toggle('open');
});
document.getElementById('sidebarBackdrop').addEventListener('click', ()=>{
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarBackdrop').classList.remove('open');
});

document.getElementById('searchInput').addEventListener('input', e=>{
  searchTerm = e.target.value;
  renderTable(tableBody, searchTerm);
});
document.getElementById('searchInputFull').addEventListener('input', e=>{
  renderTable(tableBodyFull, e.target.value);
});

dashDateSelect.addEventListener('change', e=>{
  selectedPrintDate = e.target.value;
  sideDateSelect.value = e.target.value;
  renderSheet();
});
sideDateSelect.addEventListener('change', e=>{
  selectedPrintDate = e.target.value;
  dashDateSelect.value = e.target.value;
  renderSheet();
});

function printSheetById(id){
  const original = document.getElementById('printSheet');
  const target = document.getElementById(id);
  if(target !== original){
    original.removeAttribute('id');
    target.id = 'printSheet';
    window.print();
    target.removeAttribute('id');
    original.id = 'printSheet';
  } else {
    window.print();
  }
}
document.getElementById('printAllBtn').addEventListener('click', ()=>printSheetById('printSheet'));
document.getElementById('printSideBtn').addEventListener('click', ()=>printSheetById('printSheet'));
document.getElementById('printTodayBtn').addEventListener('click', ()=>printSheetById('printSheetToday'));

window.printSingle = function(id){
  const r = requests.find(x=>x.id===id);
  if(!r) return;
  selectedPrintDate = r.dateMesse;
  dashDateSelect.value = selectedPrintDate;
  sideDateSelect.value = selectedPrintDate;
  renderSheet();
  showToast(`Aperçu mis à jour pour ${r.demandePar}`);
  document.querySelector('.nav-item[data-view="accueil"]').click();
  setTimeout(()=>{ document.getElementById('printSheet').scrollIntoView({behavior:'smooth', block:'center'}); }, 250);
};

document.getElementById('exportBtn').addEventListener('click', ()=>{
  showToast('Génération du PDF via impression système…');
  setTimeout(()=>window.print(), 400);
});

window.viewDetail = function(id){
  const r = requests.find(x=>x.id===id);
  if(!r) return;
  document.getElementById('detailModalBody').innerHTML = `
    <div class="detail-row"><span class="k">Demandé par</span><span class="v">${escapeHtml(r.demandePar)}</span></div>
    <div class="detail-row"><span class="k">Intention</span><span class="v">${escapeHtml(r.intention)}</span></div>
    <div class="detail-row"><span class="k">Date de messe</span><span class="v">${capitalize(fmtLong(r.dateMesse))}</span></div>
    <div class="detail-row"><span class="k">Date de déclaration</span><span class="v">${fmtShort(r.dateDeclaration)}</span></div>
    <div class="detail-row"><span class="k">Montant</span><span class="v">${fmtMoney(r.montant)} FCFA</span></div>
    <div class="detail-row"><span class="k">État</span><span class="v">${badgeFor(r.etat)}</span></div>
  `;
  document.getElementById('detailModal').classList.add('open');
};
document.getElementById('closeDetailModal').addEventListener('click', ()=>document.getElementById('detailModal').classList.remove('open'));
document.getElementById('detailModal').addEventListener('click', e=>{ if(e.target.id==='detailModal') e.currentTarget.classList.remove('open'); });

window.openEdit = function(id){
  const r = requests.find(x=>x.id===id);
  if(!r) return;
  document.getElementById('e_id').value = r.id;
  document.getElementById('e_demandePar').value = r.demandePar;
  document.getElementById('e_intention').value = r.intention;
  document.getElementById('e_dateMesse').value = r.dateMesse;
  document.getElementById('e_montant').value = r.montant;
  document.getElementById('e_etat').value = r.etat;
  document.getElementById('editModal').classList.add('open');
};
document.getElementById('closeEditModal').addEventListener('click', ()=>document.getElementById('editModal').classList.remove('open'));
document.getElementById('editModal').addEventListener('click', e=>{ if(e.target.id==='editModal') e.currentTarget.classList.remove('open'); });

document.getElementById('editForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const id = parseInt(document.getElementById('e_id').value);
  const updated = {
    demande_par: document.getElementById('e_demandePar').value.trim(),
    intention: document.getElementById('e_intention').value.trim(),
    date_messe: document.getElementById('e_dateMesse').value,
    montant: parseInt(document.getElementById('e_montant').value) || 0,
    etat: document.getElementById('e_etat').value,
  };
  const { error } = await sb.from(TABLE).update(updated).eq('id', id);
  if(error){
    showToast("Erreur : " + error.message);
    return;
  }
  document.getElementById('editModal').classList.remove('open');
  await loadRequests();
  showToast('Demande mise à jour avec succès');
});

document.getElementById('deleteFromEditBtn').addEventListener('click', async ()=>{
  const id = parseInt(document.getElementById('e_id').value);
  const { error } = await sb.from(TABLE).delete().eq('id', id);
  if(error){
    showToast("Erreur : " + error.message);
    return;
  }
  document.getElementById('editModal').classList.remove('open');
  await loadRequests();
  showToast('Demande supprimée');
});

document.getElementById('f_dateMesse').value = TODAY_ISO;
document.getElementById('newRequestForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const newReq = {
    demande_par: document.getElementById('f_demandePar').value.trim(),
    intention: document.getElementById('f_intention').value.trim(),
    date_declaration: TODAY_ISO,
    date_messe: document.getElementById('f_dateMesse').value,
    montant: parseInt(document.getElementById('f_montant').value) || 0,
    etat: document.getElementById('f_etat').value,
  };
  const { error } = await sb.from(TABLE).insert(newReq);
  if(error){
    showToast("Erreur : " + error.message);
    return;
  }
  e.target.reset();
  document.getElementById('f_dateMesse').value = TODAY_ISO;
  await loadRequests();
  showToast('Nouvelle demande enregistrée');
  document.querySelector('.nav-item[data-view="accueil"]').click();
});
document.getElementById('cancelNewBtn').addEventListener('click', ()=>{
  document.getElementById('newRequestForm').reset();
  document.getElementById('f_dateMesse').value = TODAY_ISO;
  document.querySelector('.nav-item[data-view="accueil"]').click();
});

document.getElementById('saveSettingsBtn').addEventListener('click', ()=>showToast('Paramètres enregistrés'));

let toastTimer;
function showToast(msg){
  clearTimeout(toastTimer);
  document.getElementById('toastMsg').textContent = msg;
  const t = document.getElementById('toast');
  t.classList.add('show');
  toastTimer = setTimeout(()=>t.classList.remove('show'), 2600);
}

loadRequests(); 
