"use strict";
// -----------------------------------------------------------------------------
// Types partagÃ©s du backend
// Ce fichier contient les interfaces et enums utilisÃ©es cÃ´tÃ© serveur et cÃ´tÃ©
// client (lorsque les types sont partagÃ©s). Les types servent Ã  mieux
// documenter les structures (ex: `Policy`, `User`).
// -----------------------------------------------------------------------------
Object.defineProperty(exports, "__esModule", { value: true });
exports.PolicyType = void 0;
/**
 * Ã‰numÃ©ration des types de polices d'assurance supportÃ©s par l'application.
 * Chaque type correspond Ã  une catÃ©gorie distincte d'assurance.
 */
var PolicyType;
(function (PolicyType) {
    PolicyType["AUTO"] = "Automobile";
    PolicyType["HOME"] = "Habitation";
    PolicyType["HEALTH"] = "Sant\u00C3\u00A9/Mutuelle";
    PolicyType["LEGAL"] = "Protection Juridique";
    PolicyType["LIFE"] = "Pr\u00C3\u00A9voyance/D\u00C3\u00A9c\u00C3\u00A8s";
    PolicyType["BANK_CARD"] = "Carte Bancaire";
    PolicyType["LOAN"] = "Emprunteur/Cr\u00C3\u00A9dit";
    PolicyType["MOBILE"] = "Appareils Mobiles";
    PolicyType["OTHER"] = "Autre"; // Autres types d'assurance non catÃ©gorisÃ©s
})(PolicyType || (exports.PolicyType = PolicyType = {}));
