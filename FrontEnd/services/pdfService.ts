
import { jsPDF } from 'jspdf';
import { Policy, OptimizationFinding, User } from '../types';

const primaryColor = [2, 132, 199]; // primary-600
const slateColor = [30, 41, 59]; // slate-800

const centerText = (doc: jsPDF, text: string, y: number) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const textWidth = doc.getTextWidth(text);
  doc.text(text, (pageWidth - textWidth) / 2, y);
};

const drawHeader = (doc: jsPDF, title: string, subtitle: string, userName: string) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(0, 0, pageWidth, 40, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('BIENCOUVERT', 15, 25);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(subtitle, 15, 32);
  
  doc.text(`Client : ${userName}`, pageWidth - 15, 20, { align: 'right' });
  doc.text(`Date : ${new Date().toLocaleDateString()}`, pageWidth - 15, 27, { align: 'right' });
};

const drawFooter = (doc: jsPDF) => {
  const pageCount = (doc as any).getNumberOfPages ? (doc as any).getNumberOfPages() : doc.internal.pages.length - 1;
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    centerText(doc, `Page ${i} sur ${pageCount} - Document confidentiel généré par BienCouvert.ia`, 285);
  }
};

export const generateOptimizationPDF = (user: User, policies: Policy[], findings: OptimizationFinding[]) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const profile = user.profile || {};

  drawHeader(doc, 'BIENCOUVERT', 'Votre audit d\'assurances intelligent', `${user.firstName} ${user.lastName}`);

  // --- PROFILE SUMMARY ---
  let cursorY = 55;
  doc.setTextColor(slateColor[0], slateColor[1], slateColor[2]);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Profil Audité', 15, cursorY);
  
  cursorY += 8;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  
  const profileItems = [
    `Foyer : ${profile.adultsCount || 1} adulte(s), ${profile.childrenCount || 0} enfant(s)`,
    `Profession : ${profile.profession || 'Non renseigné'} (${profile.workStatus || 'N/A'})`,
    `Habitat : ${profile.housingStatus === 'owner' ? 'Propriétaire' : 'Locataire'} - ${profile.housingSurface || 'N/A'} m2`,
    `Mobilité : ${profile.vehiclesCount || 0} véhicule(s), ${profile.teleworkDays || 0} j/sem télétravail`,
    `Revenus : ${profile.monthlyIncome || 'N/A'} € / mois`,
    `Historique : ${profile.claimsLast5Years || 0} sinistre(s) (5 ans)`
  ];

  profileItems.forEach((item, i) => {
    doc.text(`- ${item}`, 15, cursorY + (i * 5));
  });

  // --- CONTRACTS LIST ---
  cursorY += 40;
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(slateColor[0], slateColor[1], slateColor[2]);
  doc.text('Vos Contrats Actifs', 15, cursorY);
  
  cursorY += 10;
  policies.forEach((policy, i) => {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`${policy.name} (${policy.insurer})`, 15, cursorY);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`Type: ${policy.type} - Formule: ${policy.coverageDetail || 'Standard'}`, 15, cursorY + 4);
    cursorY += 12;
    if (cursorY > 260) { doc.addPage(); cursorY = 20; }
  });

  // --- FINDINGS SECTION ---
  cursorY += 10;
  if (cursorY > 240) { doc.addPage(); cursorY = 20; }
  
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(slateColor[0], slateColor[1], slateColor[2]);
  doc.text('Recommandations de l\'Audit IA', 15, cursorY);
  cursorY += 12;

  findings.forEach((finding, index) => {
    if (cursorY > 250) { doc.addPage(); cursorY = 20; }

    doc.setDrawColor(241, 245, 249);
    doc.setFillColor(250, 250, 250);
    doc.roundedRect(15, cursorY, pageWidth - 30, 35, 2, 2, 'FD');

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(slateColor[0], slateColor[1], slateColor[2]);
    doc.text(finding.title, 20, cursorY + 8);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    const splitDesc = doc.splitTextToSize(finding.description, pageWidth - 40);
    doc.text(splitDesc, 20, cursorY + 14);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text(`CONSEIL : ${finding.recommendation}`, 20, cursorY + 30);

    cursorY += 42;
  });

  drawFooter(doc);
  doc.save(`BienCouvert_Audit_${user.lastName}.pdf`);
};

export const generatePortfolioPDF = (user: User, policies: Policy[]) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  drawHeader(doc, 'BIENCOUVERT', 'Récapitulatif de votre portefeuille d\'assurances', `${user.firstName} ${user.lastName}`);

  let cursorY = 55;
  doc.setTextColor(slateColor[0], slateColor[1], slateColor[2]);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Portefeuille de Contrats', 15, cursorY);
  
  cursorY += 15;

  if (policies.length === 0) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(148, 163, 184);
    doc.text('Aucun contrat enregistré dans votre portefeuille.', 15, cursorY);
  } else {
    policies.forEach((policy, index) => {
      // Check for page overflow
      if (cursorY > 240) {
        doc.addPage();
        cursorY = 20;
      }

      // Draw Policy Box
      doc.setDrawColor(226, 232, 240); // slate-200
      doc.setFillColor(248, 250, 252); // slate-50
      doc.roundedRect(15, cursorY, pageWidth - 30, 42, 4, 4, 'FD');

      // Policy Details
      doc.setTextColor(slateColor[0], slateColor[1], slateColor[2]);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(policy.name, 22, cursorY + 10);
      
      doc.setFontSize(10);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text(policy.insurer.toUpperCase(), 22, cursorY + 17);

      doc.setTextColor(71, 85, 105);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Type : ${policy.type}`, 22, cursorY + 25);
      doc.text(`Formule : ${policy.coverageDetail || 'Standard'}`, 22, cursorY + 31);

      if (policy.options && policy.options.length > 0) {
        doc.setFont('helvetica', 'italic');
        const optionsText = `Options : ${policy.options.join(', ')}`;
        const splitOptions = doc.splitTextToSize(optionsText, pageWidth - 50);
        doc.text(splitOptions, 22, cursorY + 37);
      }

      cursorY += 50;
    });
  }

  drawFooter(doc);
  doc.save(`BienCouvert_Portefeuille_${user.lastName}.pdf`);
};
