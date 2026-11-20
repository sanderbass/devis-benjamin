'use strict';
/* Mes devis : logiciel de devis pour électricien. Tout est enregistré dans le téléphone/ordinateur. */

const CLE = 'devis-benjamin-v1';
const UNITES = ['u', 'm', 'ml', 'm²', 'h', 'forfait', 'lot', 'couronne', 'jour'];
const STATUTS = {
  brouillon: { nom: 'Brouillon', cls: 'gris' },
  envoye: { nom: 'Envoyé', cls: 'bleu' },
  accepte: { nom: 'Accepté', cls: 'vert' },
  refuse: { nom: 'Refusé', cls: 'rouge' },
};
const TVAS = [20, 10, 5.5];
const JOURS_PRIX_ANCIEN = 30;

/* ---------- Petits outils ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const num = (v) => {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return isFinite(n) ? n : 0;
};
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const fmtEur = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n || 0);
const fmtIn = (n) => (n === '' || n == null ? '' : String(r2(num(n))).replace('.', ','));
const fmtCoef = (n) => '×' + String(Math.round(num(n) * 100) / 100).replace('.', ',');
const fmtPct = (n) => String(Math.round(n * 10) / 10).replace('.', ',') + ' %';
const aujourdhui = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fmtDate = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
const ajouterJours = (iso, j) => {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + num(j));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const joursDepuis = (iso) => (iso ? Math.floor((Date.now() - new Date(iso + 'T12:00:00').getTime()) / 86400000) : Infinity);
const copie = (o) => JSON.parse(JSON.stringify(o));

/* ---------- Données ---------- */
function etatInitial() {
  return {
    version: 1,
    entreprise: {
      nom: '', activite: 'Électricité générale', adresse: '', cp: '', ville: '',
      tel: '', email: '', siret: '', tvaIntra: '', assurance: '', logo: '',
    },
    reglages: {
      coefDefaut: 1.4,
      tvaDefaut: 10,
      franchiseTva: false,
      validiteJours: 30,
      acomptePct: 30,
      prefixe: 'D',
      afficherRefs: false,
      cacherMarges: false,
      conditions: 'Acompte à la signature, solde à la fin des travaux. Paiement par virement ou chèque.',
      mentionTvaReduite: "Taux réduit de TVA applicable aux travaux d'amélioration ou d'entretien d'un logement achevé depuis plus de 2 ans, sous réserve de la déclaration du client.",
      familles: [
        { id: 'cables', nom: 'Câbles et conduits', coef: 1.3 },
        { id: 'appareillage', nom: 'Appareillage (prises, interrupteurs)', coef: 1.5 },
        { id: 'tableau', nom: 'Tableau et protection', coef: 1.35 },
        { id: 'eclairage', nom: 'Éclairage', coef: 1.5 },
        { id: 'divers', nom: 'Divers', coef: 1.4 },
      ],
      taux: [
        { id: 'elec', nom: 'Main-d’œuvre électricien', prix: 45, unite: 'h' },
        { id: 'deplacement', nom: 'Déplacement', prix: 30, unite: 'forfait' },
      ],
    },
    articles: [],
    devis: [],
    compteur: {},
    derniereSauvegarde: '',
  };
}

let S;
function charger() {
  try {
    const brut = localStorage.getItem(CLE);
    S = brut ? JSON.parse(brut) : etatInitial();
  } catch (e) {
    S = etatInitial();
  }
  // Complète les champs ajoutés dans les versions suivantes
  const base = etatInitial();
  S.entreprise = { ...base.entreprise, ...S.entreprise };
  S.reglages = { ...base.reglages, ...S.reglages };
  for (const k of ['articles', 'devis']) if (!Array.isArray(S[k])) S[k] = [];
  S.compteur = S.compteur || {};
}
let minuteurSauvegarde;
function sauver(tout_de_suite) {
  clearTimeout(minuteurSauvegarde);
  const ecrire = () => {
    try {
      localStorage.setItem(CLE, JSON.stringify(S));
    } catch (e) {
      toast("Impossible d'enregistrer : mémoire pleine ? Enlève le logo ou fais une sauvegarde.");
    }
  };
  if (tout_de_suite) ecrire();
  else minuteurSauvegarde = setTimeout(ecrire, 250);
}
window.addEventListener('pagehide', () => sauver(true));

/* ---------- Calculs ---------- */
const famille = (id) => S.reglages.familles.find((f) => f.id === id);
function coefPour(article) {
  if (article.coef) return num(article.coef);
  const f = famille(article.famille);
  return f && num(f.coef) ? num(f.coef) : num(S.reglages.coefDefaut) || 1;
}
const prixVente = (article) => r2(num(article.prixAchat) * coefPour(article));
const totalLigne = (l) => (l.type === 'titre' ? 0 : r2(num(l.qte) * num(l.pu)));
function tauxTva(d) {
  return S.reglages.franchiseTva ? 0 : num(d.tva);
}
function totaux(d) {
  let ht = 0, achat = 0, venteMat = 0, mo = 0, autre = 0;
  for (const l of d.lignes) {
    if (l.type === 'titre') continue;
    const t = totalLigne(l);
    ht += t;
    if (l.type === 'article') {
      achat += num(l.qte) * num(l.prixAchat);
      venteMat += t;
    } else if (l.type === 'mo') mo += t;
    else autre += t;
  }
  ht = r2(ht);
  achat = r2(achat);
  const remise = r2((ht * num(d.remisePct)) / 100);
  const htNet = r2(ht - remise);
  const taux = tauxTva(d);
  const tva = r2((htNet * taux) / 100);
  const ttc = r2(htNet + tva);
  const acompte = r2((ttc * num(d.acomptePct)) / 100);
  const gain = r2(htNet - achat);
  return { ht, remise, htNet, taux, tva, ttc, acompte, achat, venteMat: r2(venteMat), mo: r2(mo), autre: r2(autre), gain };
}

/* ---------- Interface : état de l'écran ---------- */
const ui = { page: 'devis', id: null, recherche: '', rechArticles: '', feuille: null };
let brouillon = null; // article en cours de modification
let devisCourant = null;

function route() {
  const p = (location.hash.slice(1) || '/devis').split('/').filter(Boolean);
  ui.page = ['devis', 'articles', 'reglages'].includes(p[0]) ? p[0] : 'devis';
  ui.id = p[1] || null;
  fermerFeuille();
  render();
  window.scrollTo(0, 0);
}

function render() {
  let html, titre;
  devisCourant = null;
  if (ui.page === 'devis' && ui.id) {
    devisCourant = S.devis.find((d) => d.id === ui.id);
    if (!devisCourant) return (location.hash = '#/devis');
    html = vueDevis(devisCourant);
    titre = 'Devis ' + devisCourant.numero;
  } else if (ui.page === 'articles') {
    html = vueArticles();
    titre = 'Mes articles';
  } else if (ui.page === 'reglages') {
    html = vueReglages();
    titre = 'Réglages';
  } else {
    html = vueListeDevis();
    titre = 'Mes devis';
  }
  $('#app').innerHTML = html;
  $('#titre-page').textContent = titre;
  document.title = titre;
  $$('.onglets a').forEach((a) => a.classList.toggle('actif', a.dataset.onglet === ui.page));
  $$('textarea.auto').forEach(ajusterHauteur);
}

/* ---------- Écran : liste des devis ---------- */
function vueListeDevis() {
  const avert = [];
  if (!S.entreprise.nom) {
    avert.push(`<a class="bandeau" href="#/reglages">👋 Pour commencer, remplis <b>ton entreprise</b> dans Réglages (nom, SIRET, assurance). Ces infos vont sur les devis.</a>`);
  }
  if (!S.articles.length) {
    avert.push(`<a class="bandeau" href="#/articles">🔌 Ajoute <b>tes articles</b> avec leur prix d'achat Rexel : tu les retrouveras dans chaque devis.</a>`);
  }
  if (S.devis.length && joursDepuis(S.derniereSauvegarde) > 14) {
    avert.push(`<button class="bandeau orange" data-action="sauvegarder">💾 Pense à faire une <b>sauvegarde</b> de tes devis (dernière : ${S.derniereSauvegarde ? fmtDate(S.derniereSauvegarde) : 'jamais'}). Touche ici.</button>`);
  }
  return `
    ${avert.join('')}
    <button class="btn principal large" data-action="nouveau-devis">＋ Nouveau devis</button>
    ${S.devis.length > 3 ? `<input class="recherche" type="search" placeholder="Chercher un client, un numéro…" data-ui="recherche" value="${esc(ui.recherche)}">` : ''}
    <div id="liste">${htmlListeDevis()}</div>`;
}
function htmlListeDevis() {
  const q = ui.recherche.trim().toLowerCase();
  const liste = S.devis
    .filter((d) => !q || [d.numero, d.client.nom, d.objet, d.client.ville].join(' ').toLowerCase().includes(q))
    .sort((a, b) => (b.cree || '').localeCompare(a.cree || ''));
  if (!S.devis.length) return `<p class="vide">Aucun devis pour l'instant.</p>`;
  if (!liste.length) return `<p class="vide">Rien ne correspond à « ${esc(q)} ».</p>`;
  return liste
    .map((d) => {
      const t = totaux(d);
      const st = STATUTS[d.statut] || STATUTS.brouillon;
      return `<a class="carte devis-carte" href="#/devis/${d.id}">
        <div class="ligne1"><b>${esc(d.client.nom || 'Client sans nom')}</b><span class="prix">${fmtEur(t.ttc)}</span></div>
        <div class="ligne2"><span>${esc(d.numero)} · ${fmtDate(d.date)}</span><span class="badge ${st.cls}">${st.nom}</span></div>
        ${d.objet ? `<div class="ligne3">${esc(d.objet)}</div>` : ''}
      </a>`;
    })
    .join('');
}

function nouveauNumero() {
  const an = new Date().getFullYear();
  S.compteur[an] = (S.compteur[an] || 0) + 1;
  return `${S.reglages.prefixe || 'D'}-${an}-${String(S.compteur[an]).padStart(3, '0')}`;
}
function nouveauDevis() {
  const R = S.reglages;
  const d = {
    id: uid(),
    numero: nouveauNumero(),
    cree: new Date().toISOString(),
    date: aujourdhui(),
    validiteJours: R.validiteJours,
    statut: 'brouillon',
    client: { nom: '', adresse: '', cp: '', ville: '', tel: '', email: '' },
    chantier: '',
    objet: '',
    debutTravaux: '',
    duree: '',
    tva: R.tvaDefaut,
    remisePct: 0,
    acomptePct: R.acomptePct,
    notes: '',
    lignes: [],
  };
  S.devis.push(d);
  sauver(true);
  location.hash = '#/devis/' + d.id;
}

/* ---------- Écran : un devis ---------- */
function champ(label, root, chemin, valeur, opts = {}) {
  const type = opts.type || 'text';
  const attrs = `data-root="${root}" data-bind="${chemin}" ${opts.num ? 'data-type="num" inputmode="decimal"' : ''} ${opts.recalc ? 'data-recalc="1"' : ''} placeholder="${esc(opts.placeholder || '')}" ${opts.autre || ''}`;
  const input = opts.textarea
    ? `<textarea class="auto" rows="${opts.rows || 2}" ${attrs}>${esc(valeur)}</textarea>`
    : `<input type="${type}" ${attrs} value="${esc(opts.num ? fmtIn(valeur) : valeur)}" ${type === 'email' ? 'autocapitalize="off"' : ''}>`;
  return `<label class="champ ${opts.cls || ''}"><span>${label}</span>${input}</label>`;
}

function vueDevis(d) {
  const c = d.client;
  const cacher = S.reglages.cacherMarges;
  return `
  <div class="barre-haut">
    <a href="#/devis" class="btn lien">‹ Mes devis</a>
    <button class="btn lien" data-action="basculer-marges">${cacher ? '👁 Voir mes marges' : '🙈 Cacher mes marges'}</button>
  </div>

  <section class="bloc">
    <div class="grille2">
      <label class="champ"><span>N° du devis</span><input data-root="devis" data-bind="numero" value="${esc(d.numero)}"></label>
      <label class="champ"><span>État</span><select data-root="devis" data-bind="statut">
        ${Object.entries(STATUTS).map(([k, s]) => `<option value="${k}" ${d.statut === k ? 'selected' : ''}>${s.nom}</option>`).join('')}
      </select></label>
      ${champ('Date', 'devis', 'date', d.date, { type: 'date' })}
      ${champ('Valable (jours)', 'devis', 'validiteJours', d.validiteJours, { num: true })}
    </div>
  </section>

  <section class="bloc">
    <h2>Client</h2>
    ${champ('Nom du client', 'devis', 'client.nom', c.nom, { placeholder: 'M. et Mme Martin' })}
    ${champ('Adresse', 'devis', 'client.adresse', c.adresse)}
    <div class="grille2">
      ${champ('Code postal', 'devis', 'client.cp', c.cp, { autre: 'inputmode="numeric"' })}
      ${champ('Ville', 'devis', 'client.ville', c.ville)}
      ${champ('Téléphone', 'devis', 'client.tel', c.tel, { type: 'tel' })}
      ${champ('E-mail', 'devis', 'client.email', c.email, { type: 'email' })}
    </div>
    ${champ('Adresse du chantier (si différente)', 'devis', 'chantier', d.chantier)}
    ${champ('Objet des travaux', 'devis', 'objet', d.objet, { placeholder: 'Rénovation électrique de la cuisine' })}
    <div class="grille2">
      ${champ('Début des travaux', 'devis', 'debutTravaux', d.debutTravaux, { placeholder: 'Début mars 2027' })}
      ${champ('Durée estimée', 'devis', 'duree', d.duree, { placeholder: '3 jours' })}
    </div>
  </section>

  <section class="bloc">
    <div class="titre-bloc">
      <h2>Travaux et matériel</h2>
      ${d.lignes.some((l) => l.type === 'article') ? `<button class="btn petit-btn" data-action="maj-prix">↻ Prix du catalogue</button>` : ''}
    </div>
    <div id="lignes">${htmlLignes(d)}</div>
    <div class="ajouts">
      <button class="btn principal" data-action="ajout-article">＋ Article</button>
      <button class="btn" data-action="ajout-mo">＋ Main-d'œuvre</button>
      <button class="btn" data-action="ajout-libre">＋ Ligne libre</button>
      <button class="btn" data-action="ajout-titre">＋ Pièce / titre</button>
    </div>
  </section>

  <section class="bloc">
    <h2>Conditions</h2>
    <div class="grille2">
      ${
        S.reglages.franchiseTva
          ? `<div class="champ"><span>TVA</span><div class="info">Non applicable (auto-entrepreneur)</div></div>`
          : `<label class="champ"><span>TVA</span><select data-root="devis" data-bind="tva" data-type="num" data-recalc="1">
              ${TVAS.map((t) => `<option value="${t}" ${num(d.tva) === t ? 'selected' : ''}>${String(t).replace('.', ',')} %</option>`).join('')}
            </select></label>`
      }
      ${champ('Remise (%)', 'devis', 'remisePct', d.remisePct, { num: true, recalc: true })}
      ${champ('Acompte (%)', 'devis', 'acomptePct', d.acomptePct, { num: true, recalc: true })}
    </div>
    ${champ('Remarques pour le client', 'devis', 'notes', d.notes, { textarea: true, placeholder: 'Ex. : fourniture des luminaires par le client.' })}
  </section>

  <section class="bloc totaux-bloc" id="totaux">${htmlTotaux(d)}</section>

  <section class="actions-devis">
    <button class="btn principal large" data-action="envoyer-pdf">📤 Envoyer le devis (PDF)</button>
    <button class="btn large" data-action="voir-pdf">👀 Voir le PDF</button>
    <div class="grille2">
      <button class="btn" data-action="dupliquer-devis">⧉ Dupliquer</button>
      <button class="btn danger" data-action="supprimer-devis">🗑 Supprimer</button>
    </div>
  </section>`;
}

function htmlLignes(d) {
  if (!d.lignes.length) return `<p class="vide">Ajoute des articles, de la main-d'œuvre ou un titre de pièce (ex. « Cuisine »).</p>`;
  return d.lignes.map((l, i) => htmlLigne(l, i, d.lignes.length)).join('');
}
function boutonsLigne(i, n) {
  return `<div class="ligne-outils">
    <button data-action="monter" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Monter">↑</button>
    <button data-action="descendre" data-i="${i}" ${i === n - 1 ? 'disabled' : ''} aria-label="Descendre">↓</button>
    <button data-action="suppr-ligne" data-i="${i}" aria-label="Supprimer la ligne">✕</button>
  </div>`;
}
function htmlMargeLigne(l) {
  if (S.reglages.cacherMarges || l.type !== 'article') return '';
  const pa = num(l.prixAchat), pu = num(l.pu);
  const marge = r2((pu - pa) * num(l.qte));
  const coef = pa ? pu / pa : 0;
  return `Achat ${fmtEur(pa)} · ${pa ? fmtCoef(coef) : ''} · marge <b class="${marge < 0 ? 'neg' : ''}">${fmtEur(marge)}</b>`;
}
function htmlLigne(l, i, n) {
  if (l.type === 'titre') {
    return `<div class="ligne titre">
      <input data-root="devis" data-bind="lignes.${i}.designation" value="${esc(l.designation)}" placeholder="Nom de la pièce (ex. Cuisine)">
      ${boutonsLigne(i, n)}
    </div>`;
  }
  const etiquette = { article: 'Article', mo: "Main-d'œuvre", libre: 'Ligne libre' }[l.type] || '';
  return `<div class="ligne" data-type-ligne="${l.type}">
    <div class="ligne-tete"><span class="etiquette">${etiquette}${l.ref ? ' · réf. ' + esc(l.ref) : ''}</span>${boutonsLigne(i, n)}</div>
    <textarea class="auto desig" rows="1" data-root="devis" data-bind="lignes.${i}.designation" placeholder="Désignation">${esc(l.designation)}</textarea>
    <div class="ligne-chiffres">
      <div class="qte">
        <button data-action="qte" data-i="${i}" data-d="-1" aria-label="Moins">−</button>
        <input inputmode="decimal" data-root="devis" data-type="num" data-recalc="1" data-bind="lignes.${i}.qte" value="${fmtIn(l.qte)}" aria-label="Quantité">
        <button data-action="qte" data-i="${i}" data-d="1" aria-label="Plus">+</button>
        <select data-root="devis" data-bind="lignes.${i}.unite" aria-label="Unité">${UNITES.concat(UNITES.includes(l.unite) || !l.unite ? [] : [l.unite]).map((u) => `<option ${u === l.unite ? 'selected' : ''}>${u}</option>`).join('')}</select>
      </div>
      <label class="pu"><span>Prix unit. HT</span><input inputmode="decimal" data-root="devis" data-type="num" data-recalc="1" data-bind="lignes.${i}.pu" value="${fmtIn(l.pu)}"></label>
      <div class="lt"><span>Total HT</span><b id="lt-${i}">${fmtEur(totalLigne(l))}</b></div>
    </div>
    <div class="petit marge" id="lm-${i}">${htmlMargeLigne(l)}</div>
  </div>`;
}

function htmlTotaux(d) {
  const t = totaux(d);
  const cacher = S.reglages.cacherMarges;
  return `
    <div class="tot"><span>Total HT</span><b>${fmtEur(t.ht)}</b></div>
    ${t.remise ? `<div class="tot"><span>Remise ${fmtIn(d.remisePct)} %</span><b>− ${fmtEur(t.remise)}</b></div><div class="tot"><span>Total HT après remise</span><b>${fmtEur(t.htNet)}</b></div>` : ''}
    <div class="tot"><span>${S.reglages.franchiseTva ? 'TVA non applicable' : 'TVA ' + fmtIn(t.taux) + ' %'}</span><b>${fmtEur(t.tva)}</b></div>
    <div class="tot grand"><span>Total TTC</span><b>${fmtEur(t.ttc)}</b></div>
    ${t.acompte ? `<div class="tot"><span>Acompte ${fmtIn(d.acomptePct)} %</span><b>${fmtEur(t.acompte)}</b></div>` : ''}
    ${
      cacher
        ? ''
        : `<div class="pour-toi">
      <div class="pour-toi-titre">Pour toi seulement (n'apparaît pas sur le devis)</div>
      <div class="tot"><span>Matériel : prix d'achat Rexel</span><b>${fmtEur(t.achat)}</b></div>
      <div class="tot"><span>Matériel : prix de vente</span><b>${fmtEur(t.venteMat)}</b></div>
      <div class="tot"><span>Marge sur le matériel</span><b>${fmtEur(r2(t.venteMat - t.achat))}${t.venteMat ? ' (' + fmtPct(((t.venteMat - t.achat) / t.venteMat) * 100) + ')' : ''}</b></div>
      <div class="tot"><span>Main-d'œuvre</span><b>${fmtEur(t.mo)}</b></div>
      ${t.autre ? `<div class="tot"><span>Lignes libres</span><b>${fmtEur(t.autre)}</b></div>` : ''}
      ${t.remise ? `<div class="tot"><span>Remise accordée</span><b>− ${fmtEur(t.remise)}</b></div>` : ''}
      <div class="tot grand"><span>Ce qui te reste (HT, achats déduits)</span><b class="${t.gain < 0 ? 'neg' : ''}">${fmtEur(t.gain)}</b></div>
    </div>`
    }`;
}

function rafraichirTotaux() {
  if (!devisCourant) return;
  const el = $('#totaux');
  if (el) el.innerHTML = htmlTotaux(devisCourant);
}
function rafraichirLignes() {
  if (!devisCourant) return;
  $('#lignes').innerHTML = htmlLignes(devisCourant);
  $$('#lignes textarea.auto').forEach(ajusterHauteur);
  rafraichirTotaux();
}

function ajouterLigne(l) {
  devisCourant.lignes.push(l);
  sauver();
  rafraichirLignes();
}
function ligneDepuisArticle(a) {
  return {
    id: uid(),
    type: 'article',
    articleId: a.id,
    ref: a.ref,
    designation: a.designation,
    unite: a.unite || 'u',
    qte: 1,
    prixAchat: num(a.prixAchat),
    pu: prixVente(a),
  };
}

/* ---------- Choisir un article (feuille) ---------- */
function feuilleChoixArticle() {
  ouvrirFeuille(`
    <div class="feuille-tete"><h2>Ajouter un article</h2><button class="btn lien" data-action="fermer">Fermer</button></div>
    <input class="recherche" type="search" placeholder="Référence ou nom (ex. prise, 3G2,5…)" data-ui="rechArticles" value="${esc(ui.rechArticles)}">
    <div id="choix-articles">${htmlChoixArticles()}</div>
    <button class="btn large" data-action="nouvel-article" data-ajouter="1">＋ Créer un article qui n'est pas dans la liste</button>
  `);
  const champRech = $('#feuille .recherche');
  if (window.matchMedia('(pointer:fine)').matches) champRech.focus();
}
function filtrerArticles(q) {
  q = q.trim().toLowerCase();
  const mots = q.split(/\s+/).filter(Boolean);
  return S.articles
    .filter((a) => {
      const txt = [a.ref, a.designation, famille(a.famille)?.nom].join(' ').toLowerCase();
      return mots.every((m) => txt.includes(m));
    })
    .sort((a, b) => (famille(a.famille)?.nom || '').localeCompare(famille(b.famille)?.nom || '') || a.designation.localeCompare(b.designation));
}
function htmlAgePrix(a) {
  const j = joursDepuis(a.datePrix);
  if (!a.datePrix) return `<span class="age vieux">prix sans date</span>`;
  return `<span class="age ${j > JOURS_PRIX_ANCIEN ? 'vieux' : ''}">prix du ${fmtDate(a.datePrix)}</span>`;
}
function htmlChoixArticles() {
  const liste = filtrerArticles(ui.rechArticles);
  if (!S.articles.length) return `<p class="vide">Ton catalogue est vide. Crée ton premier article ci-dessous.</p>`;
  if (!liste.length) return `<p class="vide">Aucun article trouvé.</p>`;
  return liste
    .map(
      (a) => `<button class="carte article-carte" data-action="choisir-article" data-id="${a.id}">
      <div class="ligne1"><b>${esc(a.designation)}</b><span class="prix">${fmtEur(prixVente(a))}</span></div>
      <div class="ligne2"><span>${a.ref ? 'Réf. ' + esc(a.ref) : 'Sans réf.'} · achat ${fmtEur(a.prixAchat)}/${esc(a.unite)}</span>${htmlAgePrix(a)}</div>
    </button>`
    )
    .join('');
}

function feuilleChoixMo() {
  ouvrirFeuille(`
    <div class="feuille-tete"><h2>Main-d'œuvre</h2><button class="btn lien" data-action="fermer">Fermer</button></div>
    ${S.reglages.taux
      .map(
        (t) => `<button class="carte" data-action="choisir-mo" data-id="${t.id}">
        <div class="ligne1"><b>${esc(t.nom)}</b><span class="prix">${fmtEur(t.prix)} / ${esc(t.unite)}</span></div>
      </button>`
      )
      .join('')}
    <p class="aide">Tes taux se règlent dans <a href="#/reglages">Réglages</a>.</p>
  `);
}

/* ---------- Écran : articles ---------- */
function vueArticles() {
  return `
    <p class="aide">Tes articles avec ton <b>prix d'achat Rexel</b>. Ouvre l'appli REXEL.FR, cherche la référence, et recopie le prix ici. Le prix de vente est calculé avec ta marge.</p>
    <button class="btn principal large" data-action="nouvel-article">＋ Nouvel article</button>
    ${S.articles.length ? `<input class="recherche" type="search" placeholder="Chercher (référence, nom…)" data-ui="rechArticles" value="${esc(ui.rechArticles)}">` : ''}
    <div id="liste-articles">${htmlListeArticles()}</div>`;
}
function htmlListeArticles() {
  if (!S.articles.length) return `<p class="vide">Aucun article pour l'instant.</p>`;
  const liste = filtrerArticles(ui.rechArticles);
  if (!liste.length) return `<p class="vide">Aucun article trouvé.</p>`;
  let fam = null, html = '';
  for (const a of liste) {
    const f = famille(a.famille)?.nom || 'Sans famille';
    if (f !== fam) {
      html += `<h3 class="famille-titre">${esc(f)}</h3>`;
      fam = f;
    }
    html += `<button class="carte article-carte" data-action="modifier-article" data-id="${a.id}">
      <div class="ligne1"><b>${esc(a.designation)}</b><span class="prix">${fmtEur(prixVente(a))}</span></div>
      <div class="ligne2"><span>${a.ref ? 'Réf. ' + esc(a.ref) : 'Sans réf.'} · achat ${fmtEur(a.prixAchat)}/${esc(a.unite)} · ${fmtCoef(coefPour(a))}</span>${htmlAgePrix(a)}</div>
    </button>`;
  }
  return html;
}

function feuilleArticle(article, ajouterAuDevis) {
  brouillon = article
    ? copie(article)
    : { id: uid(), ref: '', designation: '', famille: S.reglages.familles[0]?.id || '', unite: 'u', prixAchat: 0, datePrix: aujourdhui(), coef: '', sourcePrix: 'manuel' };
  const a = brouillon;
  ouvrirFeuille(`
    <div class="feuille-tete"><h2>${article ? 'Modifier l’article' : 'Nouvel article'}</h2><button class="btn lien" data-action="fermer">Annuler</button></div>
    <div class="grille2">
      <label class="champ"><span>Référence Rexel</span>
        <div class="avec-btn"><input data-root="brouillon" data-bind="ref" value="${esc(a.ref)}" autocapitalize="characters" placeholder="Ex. 069431">
        <button class="btn" data-action="copier-ref" title="Copier pour la coller dans l'appli Rexel">Copier</button></div>
      </label>
      <label class="champ"><span>Famille</span><select data-root="brouillon" data-bind="famille" data-recalc="1">
        ${S.reglages.familles.map((f) => `<option value="${f.id}" ${f.id === a.famille ? 'selected' : ''}>${esc(f.nom)}</option>`).join('')}
      </select></label>
    </div>
    ${Prix.actif() ? `<button class="btn" data-action="prix-rexel">⚡ Prix Rexel automatique</button>` : ''}
    ${champ('Désignation (ce que verra le client)', 'brouillon', 'designation', a.designation, { textarea: true, rows: 2, placeholder: 'Prise de courant 2P+T 16 A blanche' })}
    <div class="grille2">
      ${champ("Prix d'achat HT (€)", 'brouillon', 'prixAchat', a.prixAchat, { num: true, recalc: true })}
      <label class="champ"><span>Par</span><select data-root="brouillon" data-bind="unite">
        ${UNITES.map((u) => `<option ${u === a.unite ? 'selected' : ''}>${u}</option>`).join('')}
      </select></label>
      ${champ('Date du prix', 'brouillon', 'datePrix', a.datePrix, { type: 'date' })}
      ${champ('Coef. perso (sinon celui de la famille)', 'brouillon', 'coef', a.coef, { num: true, recalc: true, placeholder: 'vide = famille' })}
    </div>
    <div class="apercu" id="apercu-pv">${htmlApercuPrix()}</div>
    <button class="btn principal large" data-action="enregistrer-article" ${ajouterAuDevis ? 'data-ajouter="1"' : ''}>${ajouterAuDevis ? 'Enregistrer et ajouter au devis' : 'Enregistrer'}</button>
    ${article ? `<button class="btn danger large" data-action="supprimer-article" data-id="${article.id}">Supprimer cet article</button>` : ''}
  `);
}
function htmlApercuPrix() {
  const a = brouillon;
  const pv = prixVente(a);
  const marge = r2(pv - num(a.prixAchat));
  return `Prix de vente HT : <b>${fmtEur(pv)}</b> / ${esc(a.unite)} <span class="petit">(${fmtCoef(coefPour(a))}, marge ${fmtEur(marge)})</span>`;
}

/* ---------- Écran : réglages ---------- */
function vueReglages() {
  const E = S.entreprise, R = S.reglages;
  return `
  <section class="bloc">
    <h2>Mon entreprise</h2>
    <p class="aide">Ces informations s'impriment sur chaque devis.</p>
    <div class="logo-zone">
      ${E.logo ? `<img src="${E.logo}" alt="Logo" class="logo-apercu">` : '<div class="logo-vide">Pas de logo</div>'}
      <div>
        <button class="btn" data-action="choisir-logo">${E.logo ? 'Changer le logo' : 'Ajouter un logo'}</button>
        ${E.logo ? '<button class="btn lien" data-action="enlever-logo">Enlever</button>' : ''}
      </div>
    </div>
    ${champ("Nom de l'entreprise", 'entreprise', 'nom', E.nom)}
    ${champ('Activité', 'entreprise', 'activite', E.activite)}
    ${champ('Adresse', 'entreprise', 'adresse', E.adresse)}
    <div class="grille2">
      ${champ('Code postal', 'entreprise', 'cp', E.cp, { autre: 'inputmode="numeric"' })}
      ${champ('Ville', 'entreprise', 'ville', E.ville)}
      ${champ('Téléphone', 'entreprise', 'tel', E.tel, { type: 'tel' })}
      ${champ('E-mail', 'entreprise', 'email', E.email, { type: 'email' })}
      ${champ('SIRET', 'entreprise', 'siret', E.siret, { autre: 'inputmode="numeric"' })}
      ${champ('N° TVA intracom.', 'entreprise', 'tvaIntra', E.tvaIntra)}
    </div>
    ${champ('Assurance décennale (assureur, n° de contrat, zone couverte)', 'entreprise', 'assurance', E.assurance, { textarea: true, rows: 2 })}
  </section>

  <section class="bloc">
    <h2>Mes marges</h2>
    <p class="aide">Le prix de vente = prix d'achat × coefficient. Exemple : ×1,5 sur une prise achetée 4 € = 6 € HT. Tu peux aussi mettre un coefficient précis sur un article.</p>
    ${R.familles
      .map(
        (f, i) => `<div class="ligne-reglage">
        <input data-root="reglages" data-bind="familles.${i}.nom" value="${esc(f.nom)}" aria-label="Nom de la famille">
        <input class="court" inputmode="decimal" data-root="reglages" data-type="num" data-bind="familles.${i}.coef" value="${fmtIn(f.coef)}" aria-label="Coefficient">
        <button class="btn lien" data-action="suppr-famille" data-i="${i}" aria-label="Supprimer">✕</button>
      </div>`
      )
      .join('')}
    <button class="btn" data-action="ajout-famille">＋ Ajouter une famille</button>
    ${champ('Coefficient par défaut', 'reglages', 'coefDefaut', R.coefDefaut, { num: true, cls: 'etroit' })}
  </section>

  <section class="bloc">
    <h2>Ma main-d'œuvre</h2>
    ${R.taux
      .map(
        (t, i) => `<div class="ligne-reglage">
        <input data-root="reglages" data-bind="taux.${i}.nom" value="${esc(t.nom)}" aria-label="Nom">
        <input class="court" inputmode="decimal" data-root="reglages" data-type="num" data-bind="taux.${i}.prix" value="${fmtIn(t.prix)}" aria-label="Prix HT">
        <select class="court" data-root="reglages" data-bind="taux.${i}.unite" aria-label="Unité">${UNITES.map((u) => `<option ${u === t.unite ? 'selected' : ''}>${u}</option>`).join('')}</select>
        <button class="btn lien" data-action="suppr-taux" data-i="${i}" aria-label="Supprimer">✕</button>
      </div>`
      )
      .join('')}
    <p class="aide">Prix HT en €. Ex. : 45 € de l'heure.</p>
    <button class="btn" data-action="ajout-taux">＋ Ajouter un taux</button>
  </section>

  <section class="bloc">
    <h2>Mes devis</h2>
    <label class="case"><input type="checkbox" data-root="reglages" data-bind="franchiseTva" ${R.franchiseTva ? 'checked' : ''}> Je suis auto-entrepreneur sans TVA (« TVA non applicable, art. 293 B du CGI »)</label>
    <div class="grille2">
      ${R.franchiseTva ? '' : `<label class="champ"><span>TVA habituelle</span><select data-root="reglages" data-bind="tvaDefaut" data-type="num">${TVAS.map((t) => `<option value="${t}" ${num(R.tvaDefaut) === t ? 'selected' : ''}>${String(t).replace('.', ',')} %</option>`).join('')}</select></label>`}
      ${champ('Validité (jours)', 'reglages', 'validiteJours', R.validiteJours, { num: true })}
      ${champ('Acompte habituel (%)', 'reglages', 'acomptePct', R.acomptePct, { num: true })}
      ${champ('Début des numéros', 'reglages', 'prefixe', R.prefixe)}
    </div>
    <label class="case"><input type="checkbox" data-root="reglages" data-bind="afficherRefs" ${R.afficherRefs ? 'checked' : ''}> Montrer les références Rexel au client sur le PDF</label>
    ${champ('Conditions de paiement', 'reglages', 'conditions', R.conditions, { textarea: true, rows: 2 })}
    ${R.franchiseTva ? '' : champ('Mention TVA réduite (10 % ou 5,5 %)', 'reglages', 'mentionTvaReduite', R.mentionTvaReduite, { textarea: true, rows: 3 })}
  </section>

  <section class="bloc">
    <h2>Prix Rexel automatiques</h2>
    <p class="aide">${
      Prix.actif()
        ? 'Branché : le bouton « Prix Rexel automatique » est disponible dans chaque article.'
        : "Pas encore disponible. Dès que Rexel donne l'accès à son API, les prix se rempliront tout seuls à partir de la référence. En attendant, recopie les prix depuis l'appli REXEL.FR."
    }</p>
  </section>

  <section class="bloc">
    <h2>Sauvegarde</h2>
    <p class="aide">Tes devis et articles sont enregistrés <b>dans cet appareil</b>. Fais une sauvegarde de temps en temps (garde-la dans tes fichiers ou envoie-la-toi par mail). Elle sert aussi à passer tes données du téléphone à l'ordinateur.</p>
    <p class="aide">Dernière sauvegarde : <b>${S.derniereSauvegarde ? fmtDate(S.derniereSauvegarde) : 'jamais'}</b> · ${S.articles.length} article(s), ${S.devis.length} devis.</p>
    <button class="btn principal" data-action="sauvegarder">💾 Faire une sauvegarde</button>
    <button class="btn" data-action="restaurer">📂 Reprendre une sauvegarde</button>
  </section>
  <p class="aide centre">Mes devis · version 1</p>`;
}

/* ---------- Feuille (fenêtre du bas) ---------- */
function ouvrirFeuille(html) {
  const f = $('#feuille');
  f.innerHTML = html;
  f.hidden = false;
  $('#voile').hidden = false;
  document.body.classList.add('bloque');
  f.scrollTop = 0;
  $$('textarea.auto', f).forEach(ajusterHauteur);
}
function fermerFeuille() {
  $('#feuille').hidden = true;
  $('#voile').hidden = true;
  $('#feuille').innerHTML = '';
  document.body.classList.remove('bloque');
  brouillon = null;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.m);
  toast.m = setTimeout(() => (t.hidden = true), 2200);
}

function ajusterHauteur(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 2 + 'px';
}

/* ---------- Liaison des champs ---------- */
const racines = {
  devis: () => devisCourant,
  brouillon: () => brouillon,
  entreprise: () => S.entreprise,
  reglages: () => S.reglages,
};
function ecrireChemin(obj, chemin, val) {
  const p = chemin.split('.');
  let o = obj;
  for (let i = 0; i < p.length - 1; i++) o = o[p[i]];
  o[p[p.length - 1]] = val;
}
function surSaisie(el) {
  const obj = racines[el.dataset.root]?.();
  if (!obj) return;
  let val = el.type === 'checkbox' ? el.checked : el.value;
  if (el.dataset.type === 'num') val = el.value.trim() === '' ? '' : num(el.value);
  ecrireChemin(obj, el.dataset.bind, val);
  sauver();

  const root = el.dataset.root;
  if (root === 'devis') {
    const m = el.dataset.bind.match(/^lignes\.(\d+)\./);
    if (m) {
      const l = devisCourant.lignes[+m[1]];
      const lt = $('#lt-' + m[1]);
      if (lt) lt.textContent = fmtEur(totalLigne(l));
      const lm = $('#lm-' + m[1]);
      if (lm) lm.innerHTML = htmlMargeLigne(l);
    }
    if (el.dataset.recalc) rafraichirTotaux();
  } else if (root === 'brouillon') {
    if (el.dataset.bind === 'prixAchat') {
      brouillon.datePrix = aujourdhui();
      brouillon.sourcePrix = 'manuel';
      const d = $('[data-bind="datePrix"]', $('#feuille'));
      if (d) d.value = brouillon.datePrix;
    }
    const ap = $('#apercu-pv');
    if (ap) ap.innerHTML = htmlApercuPrix();
  } else if (root === 'reglages' && ['franchiseTva'].includes(el.dataset.bind)) {
    render();
  }
}
document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.matches('textarea.auto')) ajusterHauteur(el);
  if (el.dataset.ui) {
    ui[el.dataset.ui] = el.value;
    if (el.dataset.ui === 'recherche') $('#liste').innerHTML = htmlListeDevis();
    if (el.dataset.ui === 'rechArticles') {
      if ($('#choix-articles')) $('#choix-articles').innerHTML = htmlChoixArticles();
      else if ($('#liste-articles')) $('#liste-articles').innerHTML = htmlListeArticles();
    }
    return;
  }
  if (el.dataset.bind && el.tagName !== 'SELECT' && el.type !== 'checkbox') surSaisie(el);
});
document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.bind && (el.tagName === 'SELECT' || el.type === 'checkbox')) surSaisie(el);
  if (el.dataset.bind && el.dataset.type === 'num' && el.tagName === 'INPUT') el.value = fmtIn(el.value);
});

/* ---------- Actions (boutons) ---------- */
const actions = {
  'nouveau-devis': nouveauDevis,
  fermer: fermerFeuille,
  'basculer-marges'() {
    S.reglages.cacherMarges = !S.reglages.cacherMarges;
    sauver();
    render();
  },
  'ajout-article'() {
    ui.rechArticles = '';
    feuilleChoixArticle();
  },
  'choisir-article'(b) {
    const a = S.articles.find((x) => x.id === b.dataset.id);
    if (!a) return;
    ajouterLigne(ligneDepuisArticle(a));
    toast('Ajouté : ' + a.designation);
  },
  'ajout-mo'() {
    feuilleChoixMo();
  },
  'choisir-mo'(b) {
    const t = S.reglages.taux.find((x) => x.id === b.dataset.id);
    if (!t) return;
    ajouterLigne({ id: uid(), type: 'mo', designation: t.nom, unite: t.unite || 'h', qte: 1, pu: num(t.prix) });
    fermerFeuille();
    toast('Main-d’œuvre ajoutée');
  },
  'ajout-libre'() {
    ajouterLigne({ id: uid(), type: 'libre', designation: '', unite: 'u', qte: 1, pu: 0 });
    const champs = $$('#lignes textarea.desig');
    champs[champs.length - 1]?.focus();
  },
  'ajout-titre'() {
    ajouterLigne({ id: uid(), type: 'titre', designation: '' });
    const champs = $$('#lignes .titre input');
    champs[champs.length - 1]?.focus();
  },
  qte(b) {
    const i = +b.dataset.i;
    const l = devisCourant.lignes[i];
    l.qte = Math.max(0, r2(num(l.qte) + num(b.dataset.d)));
    $(`[data-bind="lignes.${i}.qte"]`).value = fmtIn(l.qte);
    $('#lt-' + i).textContent = fmtEur(totalLigne(l));
    $('#lm-' + i).innerHTML = htmlMargeLigne(l);
    sauver();
    rafraichirTotaux();
  },
  monter(b) {
    const i = +b.dataset.i, L = devisCourant.lignes;
    if (i > 0) [L[i - 1], L[i]] = [L[i], L[i - 1]];
    sauver();
    rafraichirLignes();
  },
  descendre(b) {
    const i = +b.dataset.i, L = devisCourant.lignes;
    if (i < L.length - 1) [L[i + 1], L[i]] = [L[i], L[i + 1]];
    sauver();
    rafraichirLignes();
  },
  'suppr-ligne'(b) {
    const i = +b.dataset.i;
    const l = devisCourant.lignes[i];
    if (l.designation && !confirm('Supprimer la ligne « ' + l.designation.slice(0, 60) + ' » ?')) return;
    devisCourant.lignes.splice(i, 1);
    sauver();
    rafraichirLignes();
  },
  'maj-prix'() {
    const d = devisCourant;
    let n = 0, introuvables = 0;
    for (const l of d.lignes) {
      if (l.type !== 'article') continue;
      const a = S.articles.find((x) => x.id === l.articleId);
      if (!a) {
        introuvables++;
        continue;
      }
      if (num(l.prixAchat) !== num(a.prixAchat) || num(l.pu) !== prixVente(a)) n++;
    }
    if (!n) return toast(introuvables ? 'Rien à changer (certains articles ont été supprimés du catalogue).' : 'Les prix sont déjà à jour.');
    if (!confirm(`${n} ligne(s) ont un prix différent dans ton catalogue.\nRemettre le prix d'achat et le prix de vente du catalogue ? (les prix modifiés à la main sur ces lignes seront remplacés)`)) return;
    for (const l of d.lignes) {
      const a = l.type === 'article' && S.articles.find((x) => x.id === l.articleId);
      if (a) {
        l.prixAchat = num(a.prixAchat);
        l.pu = prixVente(a);
      }
    }
    sauver();
    rafraichirLignes();
    toast('Prix mis à jour');
  },
  'dupliquer-devis'() {
    const d = copie(devisCourant);
    d.id = uid();
    d.numero = nouveauNumero();
    d.cree = new Date().toISOString();
    d.date = aujourdhui();
    d.statut = 'brouillon';
    d.lignes.forEach((l) => (l.id = uid()));
    S.devis.push(d);
    sauver(true);
    toast('Copie créée : ' + d.numero);
    location.hash = '#/devis/' + d.id;
  },
  'supprimer-devis'() {
    if (!confirm(`Supprimer le devis ${devisCourant.numero} ? C'est définitif.`)) return;
    S.devis = S.devis.filter((d) => d.id !== devisCourant.id);
    sauver(true);
    location.hash = '#/devis';
  },
  'voir-pdf'() {
    voirPdf(devisCourant);
  },
  'envoyer-pdf'() {
    envoyerPdf(devisCourant);
  },

  // Articles
  'nouvel-article'(b) {
    feuilleArticle(null, b.dataset.ajouter === '1');
  },
  'modifier-article'(b) {
    feuilleArticle(S.articles.find((a) => a.id === b.dataset.id), false);
  },
  'enregistrer-article'(b) {
    const a = brouillon;
    a.designation = a.designation.trim();
    a.ref = a.ref.trim();
    if (!a.designation) return toast('Il manque la désignation.');
    const i = S.articles.findIndex((x) => x.id === a.id);
    if (i >= 0) S.articles[i] = a;
    else S.articles.push(a);
    sauver(true);
    const ajouter = b.dataset.ajouter === '1' && devisCourant;
    fermerFeuille();
    if (ajouter) {
      ajouterLigne(ligneDepuisArticle(a));
      toast('Article créé et ajouté au devis');
    } else {
      toast('Article enregistré');
      render();
    }
  },
  'supprimer-article'(b) {
    if (!confirm('Supprimer cet article du catalogue ? (les devis déjà faits ne changent pas)')) return;
    S.articles = S.articles.filter((a) => a.id !== b.dataset.id);
    sauver(true);
    fermerFeuille();
    render();
  },
  async 'copier-ref'() {
    const ref = brouillon?.ref?.trim();
    if (!ref) return toast('Tape d’abord la référence.');
    try {
      await navigator.clipboard.writeText(ref);
      toast('Référence copiée : colle-la dans l’appli Rexel');
    } catch (e) {
      toast('Copie impossible sur cet appareil');
    }
  },
  async 'prix-rexel'() {
    const ref = brouillon?.ref?.trim();
    if (!ref) return toast('Tape d’abord la référence.');
    try {
      const p = await Prix.chercher(ref);
      if (!p) return;
      Object.assign(brouillon, { prixAchat: p.prixAchat, datePrix: p.datePrix, sourcePrix: p.sourcePrix });
      if (!brouillon.designation) brouillon.designation = p.designation;
      const f = $('#feuille');
      for (const k of ['prixAchat', 'datePrix', 'designation']) {
        const el = $(`[data-bind="${k}"]`, f);
        if (el) el.value = k === 'prixAchat' ? fmtIn(brouillon[k]) : brouillon[k];
      }
      $('#apercu-pv').innerHTML = htmlApercuPrix();
      toast('Prix Rexel récupéré');
    } catch (e) {
      toast(e.message);
    }
  },

  // Réglages
  'ajout-famille'() {
    S.reglages.familles.push({ id: uid(), nom: 'Nouvelle famille', coef: S.reglages.coefDefaut });
    sauver();
    render();
  },
  'suppr-famille'(b) {
    const f = S.reglages.familles[+b.dataset.i];
    const n = S.articles.filter((a) => a.famille === f.id).length;
    if (!confirm(`Supprimer la famille « ${f.nom} » ?${n ? `\n${n} article(s) passeront au coefficient par défaut.` : ''}`)) return;
    S.reglages.familles.splice(+b.dataset.i, 1);
    sauver();
    render();
  },
  'ajout-taux'() {
    S.reglages.taux.push({ id: uid(), nom: 'Nouveau taux', prix: 0, unite: 'h' });
    sauver();
    render();
  },
  'suppr-taux'(b) {
    if (!confirm('Supprimer ce taux ?')) return;
    S.reglages.taux.splice(+b.dataset.i, 1);
    sauver();
    render();
  },
  'choisir-logo'() {
    $('#fichier-logo').click();
  },
  'enlever-logo'() {
    S.entreprise.logo = '';
    sauver();
    render();
  },
  sauvegarder() {
    const nom = `sauvegarde-devis-${aujourdhui()}.json`;
    const blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
    S.derniereSauvegarde = aujourdhui();
    sauver(true);
    partagerOuTelecharger(blob, nom, 'Sauvegarde de mes devis').then(() => render());
  },
  restaurer() {
    $('#fichier-restaurer').click();
  },
};

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-action]');
  if (!b || b.disabled) return;
  const f = actions[b.dataset.action];
  if (f) {
    e.preventDefault();
    f(b, e);
  }
});
$('#voile').addEventListener('click', fermerFeuille);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#feuille').hidden) fermerFeuille();
});

/* ---------- Fichiers : logo, sauvegarde ---------- */
$('#fichier-logo').addEventListener('change', (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const img = new Image();
  img.onload = () => {
    const max = 400;
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k);
    c.height = Math.round(img.height * k);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    S.entreprise.logo = c.toDataURL('image/jpeg', 0.85);
    URL.revokeObjectURL(img.src);
    sauver(true);
    render();
  };
  img.onerror = () => toast('Image illisible');
  img.src = URL.createObjectURL(f);
});

$('#fichier-restaurer').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (!data || !Array.isArray(data.articles) || !Array.isArray(data.devis)) throw new Error();
    if (!confirm(`Cette sauvegarde contient ${data.articles.length} article(s) et ${data.devis.length} devis.\nElle va REMPLACER ce qu'il y a dans cet appareil. Continuer ?`)) return;
    localStorage.setItem(CLE, JSON.stringify(data));
    charger();
    toast('Sauvegarde reprise');
    render();
  } catch (err) {
    toast("Ce fichier n'est pas une sauvegarde de Mes devis.");
  }
});

async function partagerOuTelecharger(blob, nom, titre) {
  const fichier = new File([blob], nom, { type: blob.type });
  const mobile = window.matchMedia('(pointer:coarse)').matches;
  if (mobile && navigator.canShare && navigator.canShare({ files: [fichier] })) {
    try {
      await navigator.share({ files: [fichier], title: titre });
      return true;
    } catch (e) {
      if (e.name === 'AbortError') return false;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return true;
}

/* ---------- Démarrage ---------- */
charger();
if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
window.addEventListener('hashchange', route);
route();
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
