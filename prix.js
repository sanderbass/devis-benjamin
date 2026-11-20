'use strict';
/*
 * Sources de prix d'achat.
 *
 * V1 : Benjamin lit son prix dans l'appli REXEL.FR et le tape lui-même (source « manuel »).
 *
 * Plus tard : si Rexel ouvre l'accès à son API officielle (pack « Découverte »),
 * on ajoutera un petit serveur (par exemple une fonction Supabase) qui garde la clé
 * API secrète et répond à  GET <urlServeur>/prix?ref=XXXX  avec
 *   { ref, designation, prixAchat, unite, date }
 * Il suffira alors de renseigner `urlServeur` ci-dessous : le bouton
 * « Prix Rexel automatique » apparaîtra dans la fiche article.
 *
 * On ne se branche PAS sur les échanges internes de l'appli ou du site Rexel,
 * et la clé API ne doit jamais se trouver dans ce fichier (il est public).
 */
const Prix = {
  urlServeur: '', // à remplir le jour où l'API Rexel est ouverte

  actif() {
    return Boolean(this.urlServeur);
  },

  async chercher(ref) {
    if (!this.actif()) return null;
    const rep = await fetch(`${this.urlServeur}/prix?ref=${encodeURIComponent(ref)}`);
    if (!rep.ok) throw new Error('Prix introuvable chez Rexel pour ' + ref);
    const p = await rep.json();
    return {
      ref: p.ref || ref,
      designation: p.designation || '',
      prixAchat: Number(p.prixAchat) || 0,
      unite: p.unite || '',
      datePrix: (p.date || new Date().toISOString()).slice(0, 10),
      sourcePrix: 'rexel-api',
    };
  },
};
