"use strict";
// -----------------------------------------------------------------------------
// Types partagés du backend
// Ce fichier contient les interfaces et enums utilisées côté serveur et côté
// client (lorsque les types sont partagés). Les types servent à mieux
// documenter les structures (ex: `Policy`, `User`).
// -----------------------------------------------------------------------------
Object.defineProperty(exports, "__esModule", { value: true });
exports.PolicyType = void 0;
var PolicyType;
(function (PolicyType) {
    PolicyType["AUTO"] = "Automobile";
    PolicyType["HOME"] = "Habitation";
    PolicyType["HEALTH"] = "Sant\u00E9/Mutuelle";
    PolicyType["LEGAL"] = "Protection Juridique";
    PolicyType["LIFE"] = "Pr\u00E9voyance/D\u00E9c\u00E8s";
    PolicyType["OTHER"] = "Autre";
})(PolicyType || (exports.PolicyType = PolicyType = {}));
