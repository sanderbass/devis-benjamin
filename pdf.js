'use strict';
/* Fabrication du devis PDF (jsPDF + autotable, sans connexion internet). */

const BLEU = [29, 78, 216];
const GRIS = [100, 100, 100];

// Les polices standard du PDF ne connaissent pas les espaces fines : on formate à la main.
function eurPdf(n) {
  const s = (Math.round((n || 0) * 100) / 100).toFixed(2).replace('.', ',');
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' €';
}
function qtePdf(n) {
  return String(Math.round(num(n) * 100) / 100).replace('.', ',');
}
const propre = (s) => String(s ?? '').replace(/[  ]/g, ' ').replace(/[’]/g, "'").trim();

function fabriquerPdf(d) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const E = S.entreprise, R = S.reglages, c = d.client;
  const t = totaux(d);
  const W = 210, H = 297, M = 15;
  const BAS = H - 22; // place gardée pour le pied de page
  let y = M;

  /* En-tête : entreprise à gauche */
  let xTxt = M;
  if (E.logo) {
    try {
      const p = doc.getImageProperties(E.logo);
      const h = 22, w = Math.min(45, (p.width * h) / p.height);
      doc.addImage(E.logo, 'JPEG', M, y, w, h);
      xTxt = M + w + 5;
    } catch (e) { /* logo ignoré */ }
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(0);
  doc.text(propre(E.nom) || 'Mon entreprise', xTxt, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(60);
  const infosE = [E.activite, E.adresse, [E.cp, E.ville].filter(Boolean).join(' '), E.tel && 'Tél. ' + E.tel, E.email].filter(Boolean).map(propre);
  doc.text(infosE, xTxt, y + 10.5);
  const basGauche = Math.max(y + 22, y + 10.5 + infosE.length * 3.9);

  /* En-tête : DEVIS à droite */
  doc.setTextColor(...BLEU);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('DEVIS', W - M, y + 7, { align: 'right' });
  doc.setTextColor(0);
  doc.setFontSize(10);
  doc.text('N° ' + propre(d.numero), W - M, y + 13, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text([`Date : ${fmtDate(d.date)}`, `Valable jusqu'au : ${fmtDate(ajouterJours(d.date, d.validiteJours || 30))}`], W - M, y + 18, { align: 'right' });
  y = Math.max(basGauche, y + 26) + 6;

  /* Bloc client (à droite) et chantier / objet (à gauche) */
  const bx = 112, bw = W - M - bx;
  const infosC = [c.nom, c.adresse, [c.cp, c.ville].filter(Boolean).join(' '), c.tel && 'Tél. ' + c.tel, c.email].filter(Boolean).map(propre);
  const lignesC = infosC.flatMap((l) => doc.splitTextToSize(l, bw - 8));
  const hC = 9 + Math.max(1, lignesC.length) * 4 + 2;
  doc.setDrawColor(200);
  doc.setFillColor(247, 248, 250);
  doc.roundedRect(bx, y, bw, hC, 2, 2, 'FD');
  doc.setFontSize(8);
  doc.setTextColor(...GRIS);
  doc.text('CLIENT', bx + 4, y + 5);
  doc.setTextColor(0);
  doc.setFontSize(10);
  if (lignesC.length) {
    doc.setFont('helvetica', 'bold');
    doc.text(lignesC[0], bx + 4, y + 10);
    doc.setFont('helvetica', 'normal');
    doc.text(lignesC.slice(1), bx + 4, y + 14);
  }

  let yg = y + 4;
  const largG = bx - M - 6;
  const blocGauche = (titre, texte) => {
    if (!texte) return;
    doc.setFontSize(8);
    doc.setTextColor(...GRIS);
    doc.text(titre, M, yg);
    doc.setFontSize(10);
    doc.setTextColor(0);
    const l = doc.splitTextToSize(propre(texte), largG);
    doc.text(l, M, yg + 4.5);
    yg += 4.5 + l.length * 4.2 + 3;
  };
  blocGauche('OBJET', d.objet);
  blocGauche('ADRESSE DU CHANTIER', d.chantier);
  if (d.debutTravaux || d.duree) {
    blocGauche('TRAVAUX', [d.debutTravaux && 'Début : ' + d.debutTravaux, d.duree && 'Durée estimée : ' + d.duree].filter(Boolean).join(' · '));
  }
  y = Math.max(y + hC, yg) + 5;

  /* Tableau des lignes */
  const corps = [];
  const aDesTitres = d.lignes.some((l) => l.type === 'titre');
  let sousTotal = 0, titreEnCours = null, nbDansSection = 0;
  const fermerSection = () => {
    if (titreEnCours !== null && nbDansSection) {
      corps.push([
        { content: 'Sous-total ' + (titreEnCours || ''), colSpan: 4, styles: { halign: 'right', fontStyle: 'italic', textColor: 80 } },
        { content: eurPdf(sousTotal), styles: { halign: 'right', fontStyle: 'bold' } },
      ]);
    }
    sousTotal = 0;
    nbDansSection = 0;
  };
  for (const l of d.lignes) {
    if (l.type === 'titre') {
      fermerSection();
      titreEnCours = propre(l.designation);
      corps.push([{ content: titreEnCours || ' ', colSpan: 5, styles: { fontStyle: 'bold', fillColor: [232, 238, 252], textColor: [20, 50, 140] } }]);
      continue;
    }
    if (aDesTitres && titreEnCours === null) titreEnCours = '';
    const tl = totalLigne(l);
    sousTotal += tl;
    nbDansSection++;
    let desig = propre(l.designation) || ' ';
    if (R.afficherRefs && l.ref) desig += '\nRéf. ' + propre(l.ref);
    corps.push([desig, qtePdf(l.qte), propre(l.unite), eurPdf(l.pu), eurPdf(tl)]);
  }
  if (aDesTitres) fermerSection();
  if (!corps.length) corps.push([{ content: 'Aucune ligne', colSpan: 5, styles: { textColor: 150 } }]);

  doc.autoTable({
    startY: y,
    head: [['Désignation', 'Qté', 'Unité', 'Prix unit. HT', 'Total HT']],
    body: corps,
    margin: { left: M, right: M, bottom: H - BAS + 2 },
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: { top: 2, bottom: 2, left: 2, right: 2 }, valign: 'top', textColor: 20, lineColor: [225, 228, 235], lineWidth: { bottom: 0.2 } },
    headStyles: { fillColor: BLEU, textColor: 255, fontStyle: 'bold', lineWidth: 0 },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 14, halign: 'right' },
      2: { cellWidth: 17, halign: 'center' },
      3: { cellWidth: 26, halign: 'right' },
      4: { cellWidth: 27, halign: 'right' },
    },
    didParseCell: (data) => {
      if (data.section === 'head' && data.column.index >= 3) data.cell.styles.halign = 'right';
      if (data.section === 'head' && data.column.index === 1) data.cell.styles.halign = 'right';
      if (data.section === 'head' && data.column.index === 2) data.cell.styles.halign = 'center';
    },
  });
  y = doc.lastAutoTable.finalY + 6;

  const place = (h) => {
    if (y + h > BAS) {
      doc.addPage();
      y = M;
    }
  };

  /* Totaux */
  const lignesTot = [['Total HT', eurPdf(t.ht)]];
  if (t.remise) lignesTot.push([`Remise ${qtePdf(d.remisePct)} %`, '- ' + eurPdf(t.remise)], ['Total HT après remise', eurPdf(t.htNet)]);
  lignesTot.push([R.franchiseTva ? 'TVA' : `TVA ${qtePdf(t.taux)} %`, R.franchiseTva ? 'non applicable' : eurPdf(t.tva)]);
  const hTot = lignesTot.length * 6 + 12 + (t.acompte ? 7 : 0);
  place(hTot);
  const tx = 120, tw = W - M - tx;
  doc.setFontSize(10);
  let yt = y;
  for (const [k, v] of lignesTot) {
    doc.setTextColor(60);
    doc.text(k, tx, yt + 4);
    doc.setTextColor(0);
    doc.text(v, W - M, yt + 4, { align: 'right' });
    yt += 6;
  }
  doc.setFillColor(...BLEU);
  doc.roundedRect(tx - 3, yt, tw + 3, 10, 1.5, 1.5, 'F');
  doc.setTextColor(255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Total TTC', tx, yt + 6.8);
  doc.text(eurPdf(t.ttc), W - M - 2, yt + 6.8, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(0);
  yt += 12;
  if (t.acompte) {
    doc.text(`Acompte à la signature (${qtePdf(d.acomptePct)} %)`, tx, yt + 4);
    doc.text(eurPdf(t.acompte), W - M, yt + 4, { align: 'right' });
    yt += 7;
  }

  /* Mentions à gauche des totaux */
  const mentions = [];
  if (R.franchiseTva) mentions.push('TVA non applicable, article 293 B du CGI.');
  else if (t.taux > 0 && t.taux < 20 && R.mentionTvaReduite) mentions.push(R.mentionTvaReduite);
  if (R.conditions) mentions.push(R.conditions);
  if (d.notes) mentions.push(d.notes);
  mentions.push('Devis gratuit.');
  doc.setFontSize(8.5);
  doc.setTextColor(60);
  let ym = y + 4;
  for (const m of mentions) {
    const l = doc.splitTextToSize(propre(m), tx - M - 10);
    if (ym + l.length * 3.6 > BAS) {
      doc.addPage();
      ym = M + 4;
      yt = M;
    }
    doc.text(l, M, ym);
    ym += l.length * 3.6 + 2;
  }
  y = Math.max(yt, ym) + 6;

  /* Signature */
  place(36);
  doc.setDrawColor(190);
  doc.setTextColor(0);
  doc.setFontSize(9);
  doc.roundedRect(W - M - 85, y, 85, 32, 2, 2);
  doc.setFont('helvetica', 'bold');
  doc.text('Bon pour accord', W - M - 81, y + 5.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(90);
  doc.text(doc.splitTextToSize('Date, signature du client et mention « Devis reçu avant l\'exécution des travaux »', 77), W - M - 81, y + 10);

  /* Pied de page sur toutes les pages */
  const pied = [
    [propre(E.nom), E.siret && 'SIRET ' + propre(E.siret), E.tvaIntra && 'TVA ' + propre(E.tvaIntra)].filter(Boolean).join(' · '),
    E.assurance ? 'Assurance décennale : ' + propre(E.assurance).replace(/\n/g, ' ') : '',
  ].filter(Boolean);
  const nb = doc.getNumberOfPages();
  for (let p = 1; p <= nb; p++) {
    doc.setPage(p);
    doc.setDrawColor(220);
    doc.line(M, H - 17, W - M, H - 17);
    doc.setFontSize(7.5);
    doc.setTextColor(110);
    let yp = H - 13;
    for (const l of pied) {
      const ll = doc.splitTextToSize(l, W - 2 * M - 20);
      doc.text(ll, M, yp);
      yp += ll.length * 3.2;
    }
    doc.text(`${propre(d.numero)} · page ${p}/${nb}`, W - M, H - 13, { align: 'right' });
  }
  return doc;
}

function nomFichierPdf(d) {
  const client = (d.client.nom || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `Devis-${d.numero}${client ? '-' + client : ''}.pdf`;
}

function verifierAvantPdf(d) {
  const manque = [];
  if (!S.entreprise.nom) manque.push("le nom de ton entreprise (Réglages)");
  if (!S.entreprise.siret) manque.push('ton SIRET (Réglages)');
  if (!d.client.nom) manque.push('le nom du client');
  if (!d.lignes.some((l) => l.type !== 'titre')) manque.push('au moins une ligne');
  if (!manque.length) return true;
  return confirm('Il manque : ' + manque.join(', ') + '.\nFaire le PDF quand même ?');
}

function voirPdf(d) {
  if (!verifierAvantPdf(d)) return;
  const doc = fabriquerPdf(d);
  const url = URL.createObjectURL(doc.output('blob'));
  const w = window.open(url, '_blank');
  if (!w) location.href = url;
}

async function envoyerPdf(d) {
  if (!verifierAvantPdf(d)) return;
  const doc = fabriquerPdf(d);
  const blob = doc.output('blob');
  const fait = await partagerOuTelecharger(blob, nomFichierPdf(d), 'Devis ' + d.numero);
  if (fait && d.statut === 'brouillon') {
    d.statut = 'envoye';
    sauver(true);
    render();
  }
}
