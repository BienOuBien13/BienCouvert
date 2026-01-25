import { FileText, CheckCircle, AlertTriangle, Scale, Shield, Mail, ArrowLeft } from 'lucide-react';

interface TermsOfServiceProps {
  onBack: () => void;
}

export default function TermsOfService({ onBack }: TermsOfServiceProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <button 
            onClick={onBack}
            className="flex items-center gap-2 text-slate-600 hover:text-primary-600 transition-colors"
          >
            <ArrowLeft size={20} />
            <span className="font-medium">Retour</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 py-12">
        <div className="bg-white rounded-2xl shadow-xl p-8 md:p-12">
          {/* Title */}
          <div className="flex items-center gap-4 mb-8">
            <div className="p-3 bg-primary-100 rounded-xl">
              <FileText size={32} className="text-primary-600" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-black text-slate-900">
                Conditions Générales d'Utilisation
              </h1>
              <p className="text-slate-600 mt-1">Dernière mise à jour : 25 janvier 2026</p>
            </div>
          </div>

          {/* Introduction */}
          <section className="mb-10">
            <p className="text-slate-700 leading-relaxed mb-4">
              Les présentes Conditions Générales d'Utilisation (CGU) régissent l'utilisation de l'application 
              <strong> BienCouvert</strong> (ci-après "le Service"), éditée par <strong>AssurClair</strong>.
            </p>
            <p className="text-slate-700 leading-relaxed">
              En créant un compte et en utilisant le Service, vous acceptez sans réserve l'intégralité des présentes CGU.
            </p>
          </section>

          {/* 1. Définitions */}
          <section className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <FileText size={24} className="text-primary-600" />
              <h2 className="text-2xl font-bold text-slate-900">1. Définitions</h2>
            </div>
            
            <div className="bg-slate-50 rounded-xl p-6">
              <ul className="space-y-3 text-slate-700">
                <li>• <strong>"Service"</strong> : L'application BienCouvert accessible via web ou application mobile</li>
                <li>• <strong>"Utilisateur"</strong> : Toute personne physique majeure ayant créé un compte</li>
                <li>• <strong>"Éditeur"</strong> : AssurClair, responsable du Service</li>
                <li>• <strong>"Contenu"</strong> : Données, documents, informations saisies par l'Utilisateur</li>
                <li>• <strong>"Compte"</strong> : Espace personnel sécurisé accessible par email et mot de passe</li>
              </ul>
            </div>
          </section>

          {/* 2. Objet du Service */}
          <section className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <CheckCircle size={24} className="text-primary-600" />
              <h2 className="text-2xl font-bold text-slate-900">2. Objet du Service</h2>
            </div>
            
            <p className="text-slate-700 mb-4">
              BienCouvert est une plateforme de gestion et d'analyse de contrats d'assurance qui permet à l'Utilisateur de :
            </p>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-blue-50 rounded-xl p-5">
                <h3 className="font-bold text-slate-900 mb-2">📋 Centralisation</h3>
                <p className="text-sm text-slate-700">
                  Regrouper et organiser tous vos contrats d'assurance (auto, habitation, santé, etc.)
                </p>
              </div>
              
              <div className="bg-green-50 rounded-xl p-5">
                <h3 className="font-bold text-slate-900 mb-2">🔍 Analyse</h3>
                <p className="text-sm text-slate-700">
                  Détecter les doublons, lacunes de couverture et opportunités d'économies
                </p>
              </div>
              
              <div className="bg-purple-50 rounded-xl p-5">
                <h3 className="font-bold text-slate-900 mb-2">🤖 Assistant IA</h3>
                <p className="text-sm text-slate-700">
                  Obtenir des réponses instantanées sur vos garanties via intelligence artificielle
                </p>
              </div>
              
              <div className="bg-orange-50 rounded-xl p-5">
                <h3 className="font-bold text-slate-900 mb-2">📊 Recommandations</h3>
                <p className="text-sm text-slate-700">
                  Recevoir des suggestions d'optimisation personnalisées basées sur votre profil
                </p>
              </div>
            </div>
          </section>

          {/* 3. Création de compte */}
          <section className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <Shield size={24} className="text-primary-600" />
              <h2 className="text-2xl font-bold text-slate-900">3. Création et gestion du compte</h2>
            </div>
            
            <div className="space-y-4 text-slate-700">
              <div className="bg-slate-50 rounded-xl p-5">
                <h3 className="font-bold text-slate-900 mb-2">Conditions d'inscription</h3>
                <ul className="space-y-2">
                  <li>• Être une personne physique majeure (18 ans minimum)</li>
                  <li>• Fournir une adresse email valide</li>
                  <li>• Choisir un mot de passe sécurisé (8 caractères minimum)</li>
                  <li>• Accepter les présentes CGU et la Politique de confidentialité</li>
                </ul>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5">
                <h3 className="font-bold text-slate-900 mb-2">⚠️ Responsabilités de l'Utilisateur</h3>
                <ul className="space-y-2">
                  <li>• Fournir des informations exactes et à jour</li>
                  <li>• Maintenir la confidentialité de vos identifiants de connexion</li>
                  <li>• Ne pas partager votre compte avec des tiers</li>
                  <li>• Signaler immédiatement toute utilisation non autorisée</li>
                  <li>• Utiliser le Service conformément à sa destination et aux lois en vigueur</li>
                </ul>
              </div>
            </div>
          </section>

          {/* 4. Utilisation du Service */}
          <section className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <CheckCircle size={24} className="text-primary-600" />
              <h2 className="text-2xl font-bold text-slate-900">4. Utilisation du Service</h2>
            </div>
            
            <div className="space-y-4">
              <div className="bg-green-50 rounded-xl p-5">
                <h3 className="font-bold text-slate-900 mb-3">✅ Usages autorisés</h3>
                <ul className="space-y-2 text-slate-700">
                  <li>• Stocker et gérer vos propres contrats d'assurance</li>
                  <li>• Consulter les analyses et recommandations générées</li>
                  <li>• Utiliser l'assistant IA pour des questions sur vos garanties</li>
                  <li>• Exporter vos données personnelles</li>
                  <li>• Partager vos statistiques de couverture</li>
                </ul>
              </div>

              <div className="bg-red-50 border border-red-200 rounded-xl p-5">
                <h3 className="font-bold text-slate-900 mb-3">❌ Usages interdits</h3>
                <ul className="space-y-2 text-slate-700">
                  <li>• Utiliser le Service à des fins illégales ou frauduleuses</li>
                  <li>• Tenter d'accéder aux données d'autres utilisateurs</li>
                  <li>• Reverse engineering, décompilation ou désassemblage du Service</li>
                  <li>• Utiliser des robots, scripts ou outils automatisés non autorisés</li>
                  <li>• Diffuser du contenu malveillant (virus, malware, etc.)</li>
                  <li>• Surcharger ou perturber le fonctionnement du Service</li>
                  <li>• Extraire massivement des données (scraping)</li>
                </ul>
              </div>
            </div>
          </section>

          {/* 5. Propriété intellectuelle */}
          <section className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <Scale size={24} className="text-primary-600" />
              <h2 className="text-2xl font-bold text-slate-900">5. Propriété intellectuelle</h2>
            </div>
            
            <div className="space-y-4 text-slate-700">
              <div className="bg-slate-50 rounded-xl p-5">
                <h3 className="font-bold text-slate-900 mb-2">🏢 Propriété de l'Éditeur</h3>
                <p className="mb-2">
                  L'ensemble du Service (code source, design, logo, algorithmes, etc.) est la propriété exclusive 
                  d'AssurClair et protégé par le droit d'auteur français et international.
                </p>
                <p className="text-sm text-slate-600">
                  Toute reproduction, représentation, modification ou exploitation non autorisée est strictement interdite.
                </p>
              </div>

              <div className="bg-blue-50 rounded-xl p-5">
                <h3 className="font-bold text-slate-900 mb-2">👤 Vos données</h3>
                <p>
                  Vous conservez l'entière propriété de vos données et documents uploadés. En utilisant le Service, 
                  vous accordez à l'Éditeur une licence d'utilisation limitée à la fourniture du Service 
                  (stockage, analyse, génération de recommandations).
                </p>
              </div>
            </div>
          </section>

          {/* 6. Disponibilité et garanties */}
          <section className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle size={24} className="text-primary-600" />
              <h2 className="text-2xl font-bold text-slate-900">6. Disponibilité et garanties</h2>
            </div>
            
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6">
              <p className="text-slate-700 mb-4">
                Le Service est fourni <strong>"en l'état"</strong> sans garantie d'aucune sorte. L'Éditeur s'efforce d'assurer 
                une disponibilité maximale mais ne peut garantir :
              </p>
              
              <ul className="space-y-2 text-slate-700 mb-4">
                <li>• Une disponibilité 24/7 sans interruption</li>
                <li>• L'absence totale d'erreurs ou de bugs</li>
                <li>• La compatibilité avec tous les équipements et navigateurs</li>
                <li>• La précision absolue des analyses et recommandations</li>
              </ul>

              <p className="text-sm text-slate-600">
                <strong>Important</strong> : Le Service est un outil d'aide à la décision. Les recommandations générées 
                ne constituent pas des conseils en assurance au sens légal. Consultez un professionnel agréé pour 
                des décisions importantes.
              </p>
            </div>
          </section>

          {/* 7. Limitation de responsabilité */}
          <section className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <Shield size={24} className="text-primary-600" />
              <h2 className="text-2xl font-bold text-slate-900">7. Limitation de responsabilité</h2>
            </div>
            
            <div className="space-y-4 text-slate-700">
              <p>
                L'Éditeur ne saurait être tenu responsable :
              </p>
              
              <ul className="space-y-2">
                <li>• Des dommages directs ou indirects résultant de l'utilisation du Service</li>
                <li>• De la perte de données causée par un dysfonctionnement technique</li>
                <li>• Des décisions prises sur la base des recommandations fournies</li>
                <li>• De l'utilisation frauduleuse de votre compte par un tiers</li>
                <li>• Des interruptions de service dues à des maintenances ou problèmes techniques</li>
                <li>• Des erreurs dans l'extraction de données depuis vos documents PDF</li>
              </ul>

              <div className="bg-blue-50 rounded-xl p-5 mt-4">
                <p className="font-bold text-slate-900 mb-2">🔒 Mesures de sécurité</p>
                <p className="text-sm">
                  L'Éditeur met en œuvre des mesures de sécurité conformes aux standards de l'industrie 
                  (chiffrement, hashage des mots de passe, HTTPS, etc.) mais ne peut garantir une sécurité absolue 
                  contre toute cyberattaque sophistiquée.
                </p>
              </div>
            </div>
          </section>

          {/* 8. Modifications et résiliation */}
          <section className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <FileText size={24} className="text-primary-600" />
              <h2 className="text-2xl font-bold text-slate-900">8. Modifications et résiliation</h2>
            </div>
            
            <div className="space-y-4">
              <div className="bg-slate-50 rounded-xl p-5">
                <h3 className="font-bold text-slate-900 mb-2">Modification des CGU</h3>
                <p className="text-slate-700">
                  L'Éditeur se réserve le droit de modifier les présentes CGU à tout moment. 
                  Les modifications seront notifiées par email et prendront effet 30 jours après notification. 
                  Votre utilisation continue du Service après ce délai vaut acceptation des nouvelles CGU.
                </p>
              </div>

              <div className="bg-slate-50 rounded-xl p-5">
                <h3 className="font-bold text-slate-900 mb-2">Modification du Service</h3>
                <p className="text-slate-700">
                  L'Éditeur peut modifier, suspendre ou interrompre tout ou partie du Service sans préavis, 
                  notamment pour maintenance, amélioration ou évolution technique.
                </p>
              </div>

              <div className="bg-red-50 border border-red-200 rounded-xl p-5">
                <h3 className="font-bold text-slate-900 mb-2">Résiliation</h3>
                <p className="text-slate-700 mb-3">
                  <strong>Par l'Utilisateur</strong> : Vous pouvez supprimer votre compte à tout moment depuis les paramètres 
                  ou en contactant contact@biencouvert.fr. La suppression est définitive et irréversible.
                </p>
                <p className="text-slate-700">
                  <strong>Par l'Éditeur</strong> : En cas de violation des CGU, l'Éditeur peut suspendre ou supprimer 
                  votre compte immédiatement sans préavis ni indemnité.
                </p>
              </div>
            </div>
          </section>

          {/* 9. Protection des données */}
          <section className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <Shield size={24} className="text-primary-600" />
              <h2 className="text-2xl font-bold text-slate-900">9. Protection des données personnelles</h2>
            </div>
            
            <div className="bg-primary-50 border border-primary-200 rounded-xl p-6">
              <p className="text-slate-700 mb-3">
                Le traitement de vos données personnelles est détaillé dans notre 
                <strong> Politique de confidentialité</strong>, accessible à l'adresse :
              </p>
              <p className="text-primary-600 font-medium">
                🔗 <a href="https://biencouvert.fr/politique-confidentialite" target="_blank" rel="noopener" className="underline">
                  biencouvert.fr/politique-confidentialite
                </a>
              </p>
              <p className="text-sm text-slate-600 mt-3">
                Vos données sont hébergées sur des serveurs Azure en Europe, conformément au RGPD.
              </p>
            </div>
          </section>

          {/* 10. Droit applicable */}
          <section className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <Scale size={24} className="text-primary-600" />
              <h2 className="text-2xl font-bold text-slate-900">10. Droit applicable et litiges</h2>
            </div>
            
            <div className="space-y-4 text-slate-700">
              <p>
                Les présentes CGU sont soumises au <strong>droit français</strong>.
              </p>
              
              <p>
                En cas de litige relatif à l'interprétation ou l'exécution des présentes CGU, les parties 
                s'efforceront de le résoudre à l'amiable. À défaut d'accord amiable dans un délai de 30 jours, 
                le litige sera porté devant les <strong>tribunaux compétents de Paris</strong>.
              </p>

              <div className="bg-blue-50 rounded-xl p-5">
                <p className="font-bold text-slate-900 mb-2">📞 Médiation</p>
                <p className="text-sm">
                  Conformément à l'article L.612-1 du Code de la consommation, vous pouvez recourir gratuitement 
                  à un médiateur de la consommation en cas de litige non résolu.
                </p>
              </div>
            </div>
          </section>

          {/* 11. Contact */}
          <section>
            <div className="flex items-center gap-3 mb-4">
              <Mail size={24} className="text-primary-600" />
              <h2 className="text-2xl font-bold text-slate-900">11. Contact et informations légales</h2>
            </div>
            
            <div className="bg-slate-50 rounded-xl p-6">
              <p className="text-slate-700 mb-4">
                Pour toute question relative aux présentes CGU :
              </p>
              
              <div className="space-y-2 text-slate-700">
                <p><strong>Éditeur</strong> : AssurClair (BienCouvert)</p>
                <p>📧 <strong>Email</strong> : <a href="mailto:contact@biencouvert.fr" className="text-primary-600 underline">contact@biencouvert.fr</a></p>
                <p>🌐 <strong>Site web</strong> : <a href="https://biencouvert.fr" target="_blank" rel="noopener" className="text-primary-600 underline">biencouvert.fr</a></p>
                <p>📍 <strong>Hébergement</strong> : Microsoft Azure - Datacenter Europe</p>
              </div>
            </div>
          </section>

          {/* Footer */}
          <div className="mt-12 pt-8 border-t border-slate-200">
            <p className="text-sm text-slate-500 text-center">
              BienCouvert (AssurClair) • Conditions Générales d'Utilisation v1.0 • 25 janvier 2026
            </p>
            <p className="text-xs text-slate-400 text-center mt-2">
              En utilisant ce Service, vous acceptez l'intégralité des présentes CGU
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
