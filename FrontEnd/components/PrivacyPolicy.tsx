import { Shield, Lock, Database, Clock, FileText, Mail, Scale, ArrowLeft } from 'lucide-react';

interface PrivacyPolicyProps {
  onBack: () => void;
}

export default function PrivacyPolicy({ onBack }: PrivacyPolicyProps) {
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
              <Shield size={32} className="text-primary-600" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-black text-slate-900">
                Politique de confidentialité
              </h1>
              <p className="text-slate-600 mt-1">Dernière mise à jour : 25 janvier 2026</p>
            </div>
          </div>

          {/* Introduction */}
          <section className="mb-10">
            <p className="text-slate-700 leading-relaxed mb-4">
              Chez <strong>BienCouvert</strong> (AssurClair), nous accordons une importance primordiale à la protection de vos données personnelles. 
              Cette politique de confidentialité décrit comment nous collectons, utilisons, stockons et protégeons vos informations 
              conformément au Règlement Général sur la Protection des Données (RGPD).
            </p>
            <p className="text-slate-700 leading-relaxed">
              En utilisant notre service, vous acceptez les pratiques décrites dans cette politique.
            </p>
          </section>

          {/* 1. Données collectées */}
          <section className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <Database size={24} className="text-primary-600" />
              <h2 className="text-2xl font-bold text-slate-900">1. Données que nous collectons</h2>
            </div>
            
            <div className="bg-slate-50 rounded-xl p-6 mb-4">
              <h3 className="font-bold text-slate-900 mb-3">📋 Données d'identification</h3>
              <ul className="space-y-2 text-slate-700">
                <li>• Adresse email</li>
                <li>• Prénom et nom</li>
                <li>• Mot de passe (hashé avec bcrypt, jamais stocké en clair)</li>
              </ul>
            </div>

            <div className="bg-slate-50 rounded-xl p-6 mb-4">
              <h3 className="font-bold text-slate-900 mb-3">🏠 Données de profil</h3>
              <ul className="space-y-2 text-slate-700">
                <li>• Composition du foyer (adultes, enfants, âges)</li>
                <li>• Informations sur l'habitat (type, surface, code postal, statut propriétaire/locataire)</li>
                <li>• Patrimoine (valeur de reconstruction, biens de valeur)</li>
                <li>• Situation professionnelle et revenus (optionnels)</li>
                <li>• Besoins de santé et pratiques sportives (optionnels)</li>
              </ul>
            </div>

            <div className="bg-slate-50 rounded-xl p-6">
              <h3 className="font-bold text-slate-900 mb-3">📄 Polices d'assurance</h3>
              <ul className="space-y-2 text-slate-700">
                <li>• Numéros de contrats</li>
                <li>• Assureurs et types d'assurance</li>
                <li>• Primes annuelles et montants de couverture</li>
                <li>• Documents de police (stockés en base64)</li>
                <li>• Formules, options et garanties</li>
                <li>• Dates de début/fin de contrat</li>
              </ul>
            </div>
          </section>

          {/* 2. Usage des données */}
          <section className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <FileText size={24} className="text-primary-600" />
              <h2 className="text-2xl font-bold text-slate-900">2. Comment nous utilisons vos données</h2>
            </div>
            
            <div className="space-y-4 text-slate-700">
              <div className="flex gap-3">
                <span className="text-primary-600 font-bold">✓</span>
                <div>
                  <strong>Gestion de votre compte</strong> : Authentification, accès sécurisé à vos données
                </div>
              </div>
              <div className="flex gap-3">
                <span className="text-primary-600 font-bold">✓</span>
                <div>
                  <strong>Analyse de couverture</strong> : Détection des doublons, lacunes et opportunités d'économies
                </div>
              </div>
              <div className="flex gap-3">
                <span className="text-primary-600 font-bold">✓</span>
                <div>
                  <strong>Recommandations personnalisées</strong> : Suggestions d'optimisation basées sur votre profil
                </div>
              </div>
              <div className="flex gap-3">
                <span className="text-primary-600 font-bold">✓</span>
                <div>
                  <strong>Assistant IA</strong> : Réponses aux questions sur vos garanties via Gemini AI
                </div>
              </div>
              <div className="flex gap-3">
                <span className="text-primary-600 font-bold">✓</span>
                <div>
                  <strong>Extraction intelligente</strong> : Analyse de vos documents PDF pour extraire automatiquement les informations
                </div>
              </div>
              <div className="flex gap-3">
                <span className="text-primary-600 font-bold">✓</span>
                <div>
                  <strong>Recherche sémantique (RAG)</strong> : Vectorisation de vos documents pour des recherches contextuelles précises
                </div>
              </div>
            </div>
          </section>

          {/* 3. Stockage et sécurité */}
          <section className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <Lock size={24} className="text-primary-600" />
              <h2 className="text-2xl font-bold text-slate-900">3. Stockage et sécurité</h2>
            </div>
            
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-4">
              <h3 className="font-bold text-slate-900 mb-3">🗄️ Infrastructure</h3>
              <ul className="space-y-2 text-slate-700">
                <li>• <strong>Base de données</strong> : PostgreSQL 16 hébergée sur Microsoft Azure (serveur: 52.143.159.51)</li>
                <li>• <strong>Localisation</strong> : Datacenter Azure Europe (conformité RGPD)</li>
                <li>• <strong>Extension</strong> : pgvector pour stockage des embeddings (768 dimensions)</li>
                <li>• <strong>Documents</strong> : Stockés en base64 dans la colonne `document_data` (table policies)</li>
              </ul>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-xl p-6">
              <h3 className="font-bold text-slate-900 mb-3">🔐 Mesures de sécurité</h3>
              <ul className="space-y-2 text-slate-700">
                <li>• <strong>Mots de passe</strong> : Hashés avec bcrypt (facteur de coût 10)</li>
                <li>• <strong>Authentification</strong> : JWT (JSON Web Tokens) avec expiration 7 jours</li>
                <li>• <strong>HTTPS</strong> : Chiffrement SSL/TLS pour toutes les communications</li>
                <li>• <strong>Accès base de données</strong> : Restreint par IP et authentification PostgreSQL</li>
                <li>• <strong>Logs</strong> : Surveillance des accès et erreurs</li>
              </ul>
            </div>
          </section>

          {/* 4. Services tiers */}
          <section className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <Scale size={24} className="text-primary-600" />
              <h2 className="text-2xl font-bold text-slate-900">4. Services tiers</h2>
            </div>
            
            <div className="space-y-4">
              <div className="bg-slate-50 rounded-xl p-6">
                <h3 className="font-bold text-slate-900 mb-2">🤖 Google Gemini AI</h3>
                <p className="text-slate-700 mb-2">
                  Nous utilisons l'API Gemini pour :
                </p>
                <ul className="space-y-1 text-slate-700 ml-4">
                  <li>• Extraction de texte depuis vos documents PDF</li>
                  <li>• Génération d'embeddings (vectorisation) pour la recherche sémantique</li>
                  <li>• Analyse et détection des doublons/lacunes</li>
                  <li>• Assistant conversationnel pour répondre à vos questions</li>
                </ul>
                <p className="text-sm text-slate-600 mt-3">
                  <strong>Données transmises</strong> : Contenu des documents, historique de conversation (contexte uniquement)<br/>
                  <strong>Conservation</strong> : Google ne conserve pas vos données au-delà du traitement de la requête<br/>
                  <strong>Politique</strong> : <a href="https://policies.google.com/privacy" target="_blank" rel="noopener" className="text-primary-600 underline">policies.google.com/privacy</a>
                </p>
              </div>

              <div className="bg-slate-50 rounded-xl p-6">
                <h3 className="font-bold text-slate-900 mb-2">☁️ Microsoft Azure</h3>
                <p className="text-slate-700">
                  Hébergement de notre infrastructure (base de données PostgreSQL, serveur backend).<br/>
                  <strong>Localisation</strong> : Europe (conformité RGPD)<br/>
                  <strong>Politique</strong> : <a href="https://privacy.microsoft.com" target="_blank" rel="noopener" className="text-primary-600 underline">privacy.microsoft.com</a>
                </p>
              </div>
            </div>
          </section>

          {/* 5. Durée de conservation */}
          <section className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <Clock size={24} className="text-primary-600" />
              <h2 className="text-2xl font-bold text-slate-900">5. Durée de conservation des données</h2>
            </div>
            
            <div className="space-y-3 text-slate-700">
              <p>• <strong>Compte actif</strong> : Vos données sont conservées tant que votre compte existe</p>
              <p>• <strong>Compte inactif</strong> : Conservation 3 ans après dernière connexion, puis suppression automatique</p>
              <p>• <strong>Suppression de compte</strong> : Suppression immédiate et définitive de toutes vos données</p>
              <p>• <strong>Documents PDF</strong> : Supprimés en même temps que le contrat associé</p>
              <p>• <strong>Embeddings RAG</strong> : Supprimés en cascade lors de la suppression d'un contrat</p>
              <p>• <strong>Historique de chat</strong> : Conservation 90 jours maximum</p>
            </div>
          </section>

          {/* 6. Vos droits RGPD */}
          <section className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <Shield size={24} className="text-primary-600" />
              <h2 className="text-2xl font-bold text-slate-900">6. Vos droits (RGPD)</h2>
            </div>
            
            <div className="bg-primary-50 border border-primary-200 rounded-xl p-6">
              <p className="text-slate-700 mb-4">Conformément au RGPD, vous disposez des droits suivants :</p>
              
              <div className="space-y-3 text-slate-700">
                <div className="flex gap-3">
                  <span className="font-bold text-primary-600">→</span>
                  <div>
                    <strong>Droit d'accès</strong> : Consulter toutes vos données depuis la section "Profil"
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="font-bold text-primary-600">→</span>
                  <div>
                    <strong>Droit de rectification</strong> : Modifier vos informations directement dans l'application
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="font-bold text-primary-600">→</span>
                  <div>
                    <strong>Droit à l'effacement</strong> : Supprimer votre compte et toutes vos données (contact@biencouvert.fr)
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="font-bold text-primary-600">→</span>
                  <div>
                    <strong>Droit à la portabilité</strong> : Exporter vos données au format JSON (contact@biencouvert.fr)
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="font-bold text-primary-600">→</span>
                  <div>
                    <strong>Droit d'opposition</strong> : Refuser le traitement de vos données (suppression de compte)
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="font-bold text-primary-600">→</span>
                  <div>
                    <strong>Droit de réclamation</strong> : Déposer une plainte auprès de la CNIL (cnil.fr)
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 7. Cookies */}
          <section className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <FileText size={24} className="text-primary-600" />
              <h2 className="text-2xl font-bold text-slate-900">7. Cookies et tracking</h2>
            </div>
            
            <p className="text-slate-700 mb-4">Nous utilisons uniquement des cookies strictement nécessaires :</p>
            <ul className="space-y-2 text-slate-700">
              <li>• <strong>assurclair_token</strong> : JWT pour l'authentification (localStorage)</li>
              <li>• <strong>assurclair_current_user</strong> : Informations utilisateur en cache (localStorage)</li>
            </ul>
            <p className="text-slate-700 mt-4">
              <strong>Aucun cookie publicitaire ou de tracking tiers n'est utilisé.</strong>
            </p>
          </section>

          {/* 8. Contact */}
          <section>
            <div className="flex items-center gap-3 mb-4">
              <Mail size={24} className="text-primary-600" />
              <h2 className="text-2xl font-bold text-slate-900">8. Nous contacter</h2>
            </div>
            
            <div className="bg-slate-50 rounded-xl p-6">
              <p className="text-slate-700 mb-4">
                Pour toute question concernant vos données personnelles ou cette politique :
              </p>
              <div className="space-y-2 text-slate-700">
                <p>📧 <strong>Email</strong> : <a href="mailto:contact@biencouvert.fr" className="text-primary-600 underline">contact@biencouvert.fr</a></p>
                <p>🌐 <strong>Site web</strong> : <a href="https://biencouvert.fr" target="_blank" rel="noopener" className="text-primary-600 underline">biencouvert.fr</a></p>
              </div>
            </div>
          </section>

          {/* Footer */}
          <div className="mt-12 pt-8 border-t border-slate-200">
            <p className="text-sm text-slate-500 text-center">
              BienCouvert (AssurClair) • Version 1.0 • Dernière mise à jour : 25 janvier 2026
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
