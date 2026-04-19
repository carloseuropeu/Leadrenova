import jsPDF from 'jspdf'
import type { Devis, Facture, LigneDevis, Profile } from './supabase'

// ── Formatters ───────────────────────────────────────────────────
const eur = (n: number) => n.toFixed(2).replace('.', ',') + ' €'
const fmtDate = (iso: string) => {
  try { return new Date(iso).toLocaleDateString('fr-FR') } catch { return iso }
}

// ── Colours ──────────────────────────────────────────────────────
const C = {
  headerBg:   [20, 35, 20]  as [number,number,number],
  headerText: [160,220,160] as [number,number,number],
  rowAlt:     [248,250,248] as [number,number,number],
  rule:       [200,210,200] as [number,number,number],
  muted:      [120,130,120] as [number,number,number],
  dark:       [30, 30, 30]  as [number,number,number],
  green:      [40,160,60]   as [number,number,number],
}

// ── Column x-positions (mm, A4 = 210mm, margins = 14mm each) ────
const COL = { desc: 16, qte: 102, unit: 120, pu: 142, total: 172 }

// ── Helper: draw artisan header + document title ─────────────────
function drawPageHeader(
  doc:        jsPDF,
  profile:    Partial<Profile>,
  docType:    'DEVIS' | 'FACTURE',
  numero:     string,
  label1:     string, val1: string,
  label2?:    string, val2?: string,
) {
  const W = doc.internal.pageSize.getWidth()

  // Artisan block (left)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...C.dark)
  doc.text(profile.full_name ?? 'Artisan', 14, 22)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...C.muted)
  let ly = 28
  if (profile.address)    { doc.text(profile.address, 14, ly);                    ly += 5 }
  if (profile.siret)      { doc.text(`SIRET : ${profile.siret}`, 14, ly);         ly += 5 }
  if (profile.tva_number && !profile.is_micro_entreprise) {
    doc.text(`N° TVA intracommunautaire : ${profile.tva_number}`, 14, ly)
  }

  // Document type (right)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(24)
  doc.setTextColor(...C.dark)
  doc.text(docType, W - 14, 22, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...C.muted)
  doc.text(`N° ${numero}`,           W - 14, 30, { align: 'right' })
  doc.text(`${label1} : ${val1}`,    W - 14, 36, { align: 'right' })
  if (label2 && val2) {
    doc.text(`${label2} : ${val2}`,  W - 14, 42, { align: 'right' })
  }

  // Horizontal rule
  doc.setDrawColor(...C.rule)
  doc.setLineWidth(0.3)
  doc.line(14, 50, W - 14, 50)
}

// ── Helper: client block ─────────────────────────────────────────
function drawClientBlock(doc: jsPDF, name: string, city?: string | null): number {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...C.muted)
  doc.text('Adressé à :', 14, 58)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(...C.dark)
  doc.text(name, 14, 64)
  if (city) { doc.text(city, 14, 70); return 76 }
  return 70
}

// ── Helper: objet line ───────────────────────────────────────────
function drawObjet(doc: jsPDF, objet: string, y: number): number {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...C.dark)
  doc.text(`Objet : ${objet}`, 14, y)
  return y + 8
}

// ── Helper: lignes table ─────────────────────────────────────────
function drawTable(doc: jsPDF, lignes: LigneDevis[], startY: number): number {
  const W = doc.internal.pageSize.getWidth()
  const ROW_H = 8

  // Header
  doc.setFillColor(...C.headerBg)
  doc.rect(14, startY, W - 28, ROW_H, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...C.headerText)
  doc.text('Description',  COL.desc,  startY + 5.5)
  doc.text('Qté',          COL.qte,   startY + 5.5)
  doc.text('Unité',        COL.unit,  startY + 5.5)
  doc.text('Prix unit. HT',COL.pu,    startY + 5.5)
  doc.text('Total HT',     COL.total, startY + 5.5)

  let y = startY + ROW_H

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)

  lignes.forEach((l, i) => {
    if (i % 2 === 1) {
      doc.setFillColor(...C.rowAlt)
      doc.rect(14, y, W - 28, ROW_H, 'F')
    }
    doc.setTextColor(...C.dark)
    // Truncate long descriptions to fit column
    const desc = l.description.length > 52 ? l.description.substring(0, 49) + '…' : l.description
    doc.text(desc,                   COL.desc,  y + 5.5)
    doc.text(String(l.quantite),     COL.qte,   y + 5.5)
    doc.text(l.unite,                COL.unit,  y + 5.5)
    doc.text(eur(l.prix_unitaire_ht),COL.pu,    y + 5.5)
    doc.text(eur(l.total_ht),        COL.total, y + 5.5)
    y += ROW_H
  })

  doc.setDrawColor(...C.rule)
  doc.setLineWidth(0.25)
  doc.line(14, y, W - 14, y)

  return y + 5
}

// ── Helper: totals block ─────────────────────────────────────────
function drawTotals(
  doc:          jsPDF,
  montant_ht:   number,
  tva_rate:     number,
  montant_tva:  number,
  montant_ttc:  number,
  isMicro:      boolean,
  startY:       number,
): number {
  const W = doc.internal.pageSize.getWidth()
  const LX = W - 82  // label x
  const VX = W - 14  // value x (right-aligned)

  let y = startY + 5

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...C.muted)
  doc.text('Montant HT',   LX, y)
  doc.text(eur(montant_ht), VX, y, { align: 'right' })
  y += 6

  if (isMicro) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(7.5)
    doc.text('TVA non applicable, art. 293 B du CGI', LX, y)
    y += 6
  } else {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(`TVA ${tva_rate} %`,  LX, y)
    doc.text(eur(montant_tva),     VX, y, { align: 'right' })
    y += 6
  }

  doc.setDrawColor(...C.muted)
  doc.setLineWidth(0.25)
  doc.line(LX, y, W - 14, y)
  y += 5

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...C.dark)
  const totalShown = isMicro ? montant_ht : montant_ttc
  doc.text('TOTAL TTC',       LX, y)
  doc.text(eur(totalShown),   VX, y, { align: 'right' })
  y += 8

  doc.setTextColor(...C.dark)
  return y
}

// ── Helper: notes block ──────────────────────────────────────────
function drawNotes(doc: jsPDF, notes: string, y: number): number {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...C.muted)
  doc.text('Notes :', 14, y)
  doc.setFont('helvetica', 'normal')
  const lines = doc.splitTextToSize(notes, 170)
  doc.text(lines, 14, y + 5)
  return y + 5 + lines.length * 4.5 + 4
}

// ── Helper: signature box (devis only) ──────────────────────────
function drawSignatureBox(doc: jsPDF, y: number) {
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...C.muted)
  doc.text('Signature et cachet (précédé de "Bon pour accord") :', 14, y)
  doc.setDrawColor(...C.rule)
  doc.setLineWidth(0.3)
  doc.rect(14, y + 4, 82, 24)
}

// ── Helper: legal footer ─────────────────────────────────────────
function drawFooter(doc: jsPDF, type: 'devis' | 'facture', isMicro: boolean) {
  const H = doc.internal.pageSize.getHeight()
  const W = doc.internal.pageSize.getWidth()

  doc.setDrawColor(...C.rule)
  doc.setLineWidth(0.2)
  doc.line(14, H - 28, W - 14, H - 28)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(...C.muted)

  let fy = H - 23
  if (type === 'devis') {
    doc.text(
      'Devis valable 30 jours à compter de sa date d\'émission. ' +
      'Vaut acceptation après signature précédée de "Bon pour accord".',
      14, fy,
    )
    fy += 4
    doc.text(
      'En cas de retard de paiement, pénalités au taux légal en vigueur. ' +
      'Indemnité forfaitaire pour frais de recouvrement : 40 €.',
      14, fy,
    )
  } else {
    doc.text(
      'Paiement à réception de facture. Tout retard entraîne des pénalités ' +
      'au taux de 3 × le taux d\'intérêt légal (art. L.441-10 C. com.).',
      14, fy,
    )
    fy += 4
    doc.text(
      'Indemnité forfaitaire pour frais de recouvrement : 40 €. ' +
      (isMicro ? 'TVA non applicable, art. 293 B du CGI.' : ''),
      14, fy,
    )
  }
}

// ── PUBLIC API ───────────────────────────────────────────────────

export function generateDevisPDF(
  devis:      Devis,
  profile:    Partial<Profile>,
  clientName: string,
  clientCity?: string | null,
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  drawPageHeader(
    doc, profile, 'DEVIS', devis.numero,
    'Date', fmtDate(devis.created_at),
    'Validité', `${devis.validite_jours} jours`,
  )

  let y = drawClientBlock(doc, clientName, clientCity)
  if (devis.objet) y = drawObjet(doc, devis.objet, y)
  y = drawTable(doc, devis.lignes, y)
  y = drawTotals(doc, devis.montant_ht, devis.tva_rate, devis.montant_tva, devis.montant_ttc, !!profile.is_micro_entreprise, y)
  if (devis.notes) y = drawNotes(doc, devis.notes, y)
  drawSignatureBox(doc, y + 4)
  drawFooter(doc, 'devis', !!profile.is_micro_entreprise)

  doc.save(`devis-${devis.numero}.pdf`)
}

export function generateFacturePDF(
  facture:    Facture,
  profile:    Partial<Profile>,
  clientName: string,
  clientCity?: string | null,
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  drawPageHeader(
    doc, profile, 'FACTURE', facture.numero,
    'Émission', fmtDate(facture.date_emission),
    'Échéance', fmtDate(facture.date_echeance),
  )

  let y = drawClientBlock(doc, clientName, clientCity)

  // Paid badge
  if (facture.statut === 'payee' && facture.date_paiement) {
    const W = doc.internal.pageSize.getWidth()
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...C.green)
    doc.text(`✓ PAYÉE le ${fmtDate(facture.date_paiement)}`, W - 14, 58, { align: 'right' })
  }

  if (facture.objet) y = drawObjet(doc, facture.objet, y)
  y = drawTable(doc, facture.lignes, y)
  y = drawTotals(doc, facture.montant_ht, facture.tva_rate, facture.montant_tva, facture.montant_ttc, !!profile.is_micro_entreprise, y)
  if (facture.notes) drawNotes(doc, facture.notes, y)
  drawFooter(doc, 'facture', !!profile.is_micro_entreprise)

  doc.save(`facture-${facture.numero}.pdf`)
}
