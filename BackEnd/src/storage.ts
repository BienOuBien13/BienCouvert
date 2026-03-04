import { query } from './db';

// -----------------------------------------------------------------------------
// Module de stockage PostgreSQL pour AssurClair
// Ce module expose des fonctions pour interagir avec la base de données PostgreSQL
// sur la VM Azure. Remplace l'ancien système de fichiers JSON.
// -----------------------------------------------------------------------------

export const storage = {
  /**
   * Lit la liste des utilisateurs depuis la table users
   * @returns Promise avec tableau d'objets utilisateur
   */
  readUsers: async <T = any>(): Promise<T[]> => {
    const result = await query('SELECT * FROM users ORDER BY id');
    return result.rows.map(row => ({
      id: row.id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      password: row.password,
      profile: row.profile ? JSON.parse(row.profile) : null,
      isAdmin: row.is_admin,
      isPartner: row.is_partner || false,
      geminiAiConsent: row.gemini_ai_consent || false
    })) as T[];
  },

  /**
   * Écrit/Met à jour un utilisateur dans la table users
   * @param data - Objet utilisateur à sauvegarder
   */
  writeUser: async (data: any) => {
    let { id, email, firstName, lastName, password, profile, isAdmin, isPartner, geminiAiConsent } = data;
    // Ajout de valeurs par défaut pour firstName et lastName
    if (!firstName) firstName = 'Utilisateur';
    if (!lastName) lastName = 'Inconnu';
    
    // Validation des champs requis
    if (!email || !password) {
      throw new Error('Missing required fields: email and password are required');
    }
    
    const profileStr = profile ? JSON.stringify(profile) : null;
    
    if (id) {
      // Mise à jour
      const result = await query(
        `UPDATE users 
         SET email = $1, first_name = $2, last_name = $3, password = $4, profile = $5, is_admin = $6, gemini_ai_consent = $7, is_partner = $8, updated_at = CURRENT_TIMESTAMP
         WHERE id = $9
         RETURNING id`,
        [email, firstName, lastName, password, profileStr, isAdmin || false, geminiAiConsent || false, isPartner || false, id]
      );
      
      if (result.rows.length === 0) {
        throw new Error(`User with id ${id} not found for update`);
      }
      
      return result.rows[0].id;
    } else {
      // Insertion
      const result = await query(
        `INSERT INTO users (email, first_name, last_name, password, profile, is_admin, gemini_ai_consent, is_partner)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [email, firstName, lastName, password, profileStr, isAdmin || false, geminiAiConsent || false, isPartner || false]
      );
      return result.rows[0].id;
    }
  },

  /**
   * Supprime un utilisateur de la table users
   * @param userId - ID de l'utilisateur à supprimer
   */
  deleteUser: async (userId: number) => {
    const result = await query('DELETE FROM users WHERE id = $1 RETURNING id', [userId]);
    if (result.rows.length === 0) {
      throw new Error(`User with id ${userId} not found for deletion`);
    }
    return result.rows[0].id;
  },

  /**
   * Écrit la liste complète des utilisateurs (pour migration)
   * @param data - Tableau d'utilisateurs à sauvegarder
   */
  writeUsers: async (data: any[]) => {
    for (const user of data) {
      await storage.writeUser(user);
    }
  },

  /**
   * Lit le profil d'analyse détaillé d'un utilisateur depuis user_analysis_profiles
   * @param userId - ID de l'utilisateur
   * @returns Objet profil ou null si non trouvé
   */
  readAnalysisProfile: async (userId: number): Promise<any | null> => {
    const result = await query(
      'SELECT * FROM user_analysis_profiles WHERE user_id = $1',
      [userId]
    );
    if (result.rows.length === 0) return null;
    const r = result.rows[0];
    return {
      adultsCount:           r.adults_count,
      childrenCount:         r.children_count,
      householdMembersAges:  r.household_members_ages || [],
      hasPets:               r.has_pets,
      petDetails:            r.pet_details,
      postalCode:            r.postal_code,
      housingStatus:         r.housing_status,
      housingType:           r.housing_type,
      residenceType:         r.residence_type,
      housingSurface:        r.housing_surface,
      constructionYear:      r.construction_year,
      hasPool:               r.has_pool,
      hasGarden:             r.has_garden,
      reconstructionValue:   r.reconstruction_value,
      highTechValue:         r.high_tech_value,
      jewelryValue:          r.jewelry_value,
      vehiclesCount:         r.vehicles_count,
      monthlyIncome:         r.monthly_income,
      workStatus:            r.work_status,
      profession:            r.profession,
      teleworkDays:          r.telework_days,
      riskySports:           r.risky_sports || [],
      healthNeeds:           r.health_needs || [],
      healthSpecifics:       r.health_specifics,
      claimsLast5Years:      r.claims_last_5_years,
      riskTolerance:         r.risk_tolerance,
    };
  },

  /**
   * Crée ou met à jour le profil d'analyse d'un utilisateur (upsert)
   * @param userId - ID de l'utilisateur
   * @param data   - Données du profil (équivalent UserProfileData)
   */
  writeAnalysisProfile: async (userId: number, data: any): Promise<void> => {
    await query(
      `INSERT INTO user_analysis_profiles (
        user_id, adults_count, children_count, household_members_ages,
        has_pets, pet_details, postal_code, housing_status, housing_type,
        residence_type, housing_surface, construction_year, has_pool, has_garden,
        reconstruction_value, high_tech_value, jewelry_value, vehicles_count,
        monthly_income, work_status, profession, telework_days, risky_sports,
        health_needs, health_specifics, claims_last_5_years, risk_tolerance,
        updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27, NOW()
      )
      ON CONFLICT (user_id) DO UPDATE SET
        adults_count            = EXCLUDED.adults_count,
        children_count          = EXCLUDED.children_count,
        household_members_ages  = EXCLUDED.household_members_ages,
        has_pets                = EXCLUDED.has_pets,
        pet_details             = EXCLUDED.pet_details,
        postal_code             = EXCLUDED.postal_code,
        housing_status          = EXCLUDED.housing_status,
        housing_type            = EXCLUDED.housing_type,
        residence_type          = EXCLUDED.residence_type,
        housing_surface         = EXCLUDED.housing_surface,
        construction_year       = EXCLUDED.construction_year,
        has_pool                = EXCLUDED.has_pool,
        has_garden              = EXCLUDED.has_garden,
        reconstruction_value    = EXCLUDED.reconstruction_value,
        high_tech_value         = EXCLUDED.high_tech_value,
        jewelry_value           = EXCLUDED.jewelry_value,
        vehicles_count          = EXCLUDED.vehicles_count,
        monthly_income          = EXCLUDED.monthly_income,
        work_status             = EXCLUDED.work_status,
        profession              = EXCLUDED.profession,
        telework_days           = EXCLUDED.telework_days,
        risky_sports            = EXCLUDED.risky_sports,
        health_needs            = EXCLUDED.health_needs,
        health_specifics        = EXCLUDED.health_specifics,
        claims_last_5_years     = EXCLUDED.claims_last_5_years,
        risk_tolerance          = EXCLUDED.risk_tolerance,
        updated_at              = NOW()`,
      [
        userId,
        data.adultsCount          ?? 1,
        data.childrenCount        ?? 0,
        data.householdMembersAges ?? [],
        data.hasPets              ?? false,
        data.petDetails           ?? null,
        data.postalCode           ?? null,
        data.housingStatus        ?? null,
        data.housingType          ?? null,
        data.residenceType        ?? null,
        data.housingSurface       ?? null,
        data.constructionYear     ?? null,
        data.hasPool              ?? false,
        data.hasGarden            ?? false,
        data.reconstructionValue  ?? null,
        data.highTechValue        ?? null,
        data.jewelryValue         ?? null,
        data.vehiclesCount        ?? 0,
        data.monthlyIncome        ?? null,
        data.workStatus           ?? null,
        data.profession           ?? null,
        data.teleworkDays         ?? 0,
        data.riskySports          ?? [],
        data.healthNeeds          ?? [],
        data.healthSpecifics      ?? null,
        data.claimsLast5Years     ?? 0,
        data.riskTolerance        ?? null,
      ]
    );
  },

  /**
   * Lit la liste des polices d'assurance depuis la table policies
   * @param userId - (Optionnel) ID de l'utilisateur pour filtrer ses polices
   * @returns Promise avec tableau d'objets police
   */
  readPolicies: async <T = any>(userId?: number): Promise<T[]> => {
    let queryText = `
      SELECT 
        p.*,
        it.label_fr as type_label,
        ist.label_fr as sub_type_label,
        i.label as insurer_label,
        i.logo_url as insurer_logo,
        ccg.url as central_cg_url,
        ucg.url as user_cg_url
      FROM policies p
      LEFT JOIN insurance_types it ON p.insurance_type_code = it.code
      LEFT JOIN insurance_sub_types ist ON p.insurance_sub_type_code = ist.code
      LEFT JOIN insurers i ON p.insurer_code = i.code
      LEFT JOIN central_cg ccg ON p.central_cg_id = ccg.id
      LEFT JOIN user_cg ucg ON p.user_cg_id = ucg.id
    `;
    const params: any[] = [];
    
    if (userId) {
      queryText += ' WHERE p.user_id = $1';
      params.push(userId);
    }
    
    queryText += ' ORDER BY p.created_at DESC';
    
    const result = await query(queryText, params);
    
    return result.rows.map(row => {
      const metadata = row.metadata || {};
      // Utilise directement label_fr depuis la table insurance_types (via type_label du JOIN)
      const typeEnum = row.type_label || 'Autre';
      const typeCode = row.insurance_type_code;
      
      return {
        id: row.id.toString(),
        userId: row.user_id.toString(),
        name: metadata.name || 'Contrat sans nom',
        insurer: row.insurer_label || 'Non spécifié',
        insurerCode: row.insurer_code,
        insurerLogo: row.insurer_logo,
        type: typeEnum, // Utilise la valeur de l'enum PolicyType (ex: 'Automobile')
        typeCode: typeCode,
        subTypeCode: row.insurance_sub_type_code || null,
        subTypeLabel: row.sub_type_label || null,
        formula: metadata.formula || null,
        options: metadata.options || [],
        premium: metadata.premium ? parseFloat(metadata.premium) : null,
        coverage: metadata.coverage ? parseFloat(metadata.coverage) : null,
        sourceUrl: row.document_url || row.central_cg_url || row.user_cg_url || null,
        cgUrl: row.central_cg_url || row.user_cg_url || null,
        summary: metadata.summary || null,
        startDate: row.start_date,
        endDate: row.end_date,
        status: row.status,
        centralCgId: row.central_cg_id,
        userCgId: row.user_cg_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    }) as T[];
  },

  /**
   * Écrit/Met à jour une police dans la table policies
   * @param data - Objet police à sauvegarder
   */
  writePolicy: async (data: any) => {
    const { 
      id, userId, insurerCode, insuranceTypeCode, insuranceSubTypeCode,
      centralCgId, userCgId, startDate, endDate, status, documentUrl, metadata
    } = data;
    
    // Validation des codes requis
    if (!insurerCode || !insuranceTypeCode) {
      throw new Error('insurerCode and insuranceTypeCode are required');
    }
    
    // Construire l'objet metadata complet
    const metadataObj = {
      name: metadata?.name || 'Contrat sans nom',
      formula: metadata?.formula || null,
      options: metadata?.options || [],
      premium: metadata?.premium || null,
      coverage: metadata?.coverage || null,
      summary: metadata?.summary || null,
      ...metadata
    };
    
    const metadataJson = JSON.stringify(metadataObj);
    
    if (id) {
      // Mise à jour
      await query(
        `UPDATE policies 
         SET user_id = $1, insurer_code = $2, insurance_type_code = $3,
             insurance_sub_type_code = $4,
             central_cg_id = $5, user_cg_id = $6, start_date = $7, end_date = $8,
             status = $9, document_url = $10, metadata = $11, updated_at = CURRENT_TIMESTAMP
         WHERE id = $12`,
        [userId, insurerCode, insuranceTypeCode, insuranceSubTypeCode || null,
         centralCgId || null, userCgId || null, 
         startDate, endDate, status, documentUrl, metadataJson, id]
      );
      return id;
    } else {
      // Insertion
      const result = await query(
        `INSERT INTO policies 
         (user_id, insurer_code, insurance_type_code, insurance_sub_type_code,
          central_cg_id, user_cg_id, start_date, end_date, status, document_url, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id`,
        [userId, insurerCode, insuranceTypeCode, insuranceSubTypeCode || null,
         centralCgId || null, userCgId || null,
         startDate, endDate, status || 'active', documentUrl, metadataJson]
      );
      return result.rows[0].id;
    }
  },

  /**
   * Écrit la liste complète des polices (pour migration)
   * @param data - Tableau de polices à sauvegarder
   */
  writePolicies: async (data: any[]) => {
    for (const policy of data) {
      await storage.writePolicy(policy);
    }
  },

  /**
   * Lit le référentiel central des CG depuis la table central_cg
   * @returns Promise avec tableau d'entrées CG
   */
  readCentralCg: async <T = any>(): Promise<T[]> => {
    const result = await query(`
      SELECT 
        cg.*,
        i.label as insurer_label,
        i.logo_url as insurer_logo,
        it.label_fr as type_label,
        ist.label_fr as sub_type_label
      FROM central_cg cg
      LEFT JOIN insurers i ON cg.insurer_code = i.code
      LEFT JOIN insurance_types it ON cg.insurance_type_code = it.code
      LEFT JOIN insurance_sub_types ist ON cg.insurance_sub_type_code = ist.code
      ORDER BY cg.id
    `);
    return result.rows.map(row => ({
      id: row.id,
      // Nouveaux champs
      insurerCode: row.insurer_code,
      insuranceTypeCode: row.insurance_type_code,
      insuranceSubTypeCode: row.insurance_sub_type_code || null,
      insuranceSubTypeLabel: row.sub_type_label || row.insurance_sub_type_code || null,
      version: row.version,
      type: row.type,
      owner: row.owner,
      detail: row.detail,
      url: row.url,
      targetFilename: row.target_filename,
      status: row.status,
      contentText: row.content_text,
      embedding: row.embedding,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      // Champs de compatibilité pour l'affichage
      insurer: row.insurer_label || row.insurer_code || 'Non spécifié',
      insurerLogo: row.insurer_logo,
      insuranceTypeLabel: row.type_label || row.insurance_type_code || '',
      productName: row.metadata?.productName || 'Document CG',
      indexedFormulas: row.metadata?.indexedFormulas || [],
      indexedOptions: row.metadata?.indexedOptions || [],
      documentUrl: row.url,
      vectorizedAt: row.vectorized_at || null,
      lastVerified: row.updated_at || row.created_at
    })) as T[];
  },

  /**
   * Écrit/Met à jour une entrée CG dans la table central_cg
   * @param data - Objet CG à sauvegarder
   */
  writeCentralCgEntry: async (data: any) => {
    const { 
      id, insurerCode, insuranceTypeCode, insuranceSubTypeCode, documentTypeCode,
      version, type, owner, 
      detail, url, targetFilename, status, contentText, embedding, metadata, pdfBase64
    } = data;
    
    // S'assurer que metadata est un objet JSON valide
    const metadataJson = typeof metadata === 'string' ? metadata : JSON.stringify(metadata || {});
    const embeddingJson = embedding ? (typeof embedding === 'string' ? embedding : JSON.stringify(embedding)) : null;
    const resolvedDocType = documentTypeCode || type || 'CG';
    
    if (id) {
      // Mise à jour
      await query(
        `UPDATE central_cg 
         SET insurer_code = $1, insurance_type_code = $2, version = $3, type = $4,
             owner = $5, detail = $6, url = $7, target_filename = $8, status = $9,
             content_text = $10, embedding = $11, metadata = $12, pdf_base64 = $13,
             insurance_sub_type_code = $14, document_type_code = $15,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $16`,
        [insurerCode, insuranceTypeCode, version, resolvedDocType, owner, detail, url, 
         targetFilename, status, contentText, embeddingJson, metadataJson, pdfBase64 || null,
         insuranceSubTypeCode || null, resolvedDocType, id]
      );
    } else {
      // Insertion
      const result = await query(
        `INSERT INTO central_cg 
         (insurer_code, insurance_type_code, version, type, owner, detail, url, 
          target_filename, status, content_text, embedding, metadata, pdf_base64,
          insurance_sub_type_code, document_type_code)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         RETURNING id`,
        [insurerCode, insuranceTypeCode, version, resolvedDocType, owner, detail, url, 
         targetFilename, status, contentText, embeddingJson, metadataJson, pdfBase64 || null,
         insuranceSubTypeCode || null, resolvedDocType]
      );
      return result.rows[0].id;
    }
  },

  /**
   * Écrit le référentiel central des CG (pour migration)
   * @param data - Tableau d'entrées CG à sauvegarder
   */
  writeCentralCg: async (data: any[]) => {
    for (const cg of data) {
      await storage.writeCentralCgEntry(cg);
    }
  },

  /**
   * Supprime une police par son ID
   * @param id - ID de la police à supprimer
   */
  deletePolicy: async (id: number) => {
    await query('DELETE FROM policies WHERE id = $1', [id]);
  },

  /**
   * Supprime une entrée CG par son ID
   * @param id - ID de l'entrée CG à supprimer
   */
  deleteCentralCgEntry: async (id: number) => {
    await query('DELETE FROM central_cg WHERE id = $1', [id]);
  },

  /**
   * Vectorise un PDF de contrat utilisateur et stocke les chunks dans policy_embeddings
   * @param policyId - ID de la police
   * @param pdfText - Texte extrait du PDF
   */
  vectorizePolicyPdf: async (policyId: number, pdfText: string) => {
    const { chunkText, generateEmbedding } = require('./services/geminiService');
    
    // Découper le texte en chunks
    const chunks = chunkText(pdfText);
    console.log(`📄 Vectorisation de ${chunks.length} chunks pour policy ${policyId}`);
    
    // Supprimer les anciens chunks si existe
    await query('DELETE FROM policy_embeddings WHERE policy_id = $1', [policyId]);
    
    // Vectoriser chaque chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = await generateEmbedding(chunk);

      await query(
        `INSERT INTO policy_embeddings (policy_id, chunk_text, chunk_index, embedding, created_at)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
        [policyId, chunk, i, embedding ? JSON.stringify(embedding) : null]
      );
    }
    
    console.log(`✅ ${chunks.length} chunks vectorisés pour policy ${policyId}`);
  },

  /**
   * Vectorise un document CG admin et met à jour central_cg.embedding
   * @param cgId - ID de l'entrée central_cg
   * @param text - Texte complet du document
   */
  vectorizeCentralCg: async (cgId: number, text: string) => {
    const { generateEmbedding } = require('./services/geminiService');
    
    console.log(`📄 Vectorisation CG ${cgId}...`);
    if (!text || !text.trim()) {
      throw new Error(`Vectorisation CG ${cgId} impossible: texte vide`);
    }

    const embedding = await generateEmbedding(text);

    if (!embedding || !embedding.some((v: number) => v !== 0)) {
      console.warn(`⚠️ Embedding indisponible pour CG ${cgId} — sauvegarde sans vecteur`);
      return; // Non fatal : les pages sont quand même indexées en texte
    }

    await query(
      `UPDATE central_cg SET embedding = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [JSON.stringify(embedding), cgId]
    );

    console.log(`✅ CG ${cgId} vectorisé`);
  },

  /**
   * Recherche sémantique dans les embeddings de contrats utilisateurs
   * @param questionEmbedding - Embedding de la question
   * @param policyIds - IDs des polices à chercher
   * @param limit - Nombre max de résultats
   * @returns Chunks pertinents avec métadonnées
   */
  searchPolicyEmbeddings: async (questionEmbedding: number[], policyIds: number[], limit: number = 5) => {
    const result = await query(
      `SELECT 
        pe.chunk_text, pe.chunk_index,
        COALESCE(i.label, p.insurer_code) as provider, 
        COALESCE(it.label_fr, p.insurance_type_code) as type, 
        p.metadata->>'name' as name,
        1 - (pe.embedding <=> $1::vector) as similarity
       FROM policy_embeddings pe
       JOIN policies p ON pe.policy_id = p.id
       LEFT JOIN insurers i ON p.insurer_code = i.code
       LEFT JOIN insurance_types it ON p.insurance_type_code = it.code
       WHERE pe.policy_id = ANY($2)
       ORDER BY pe.embedding <=> $1::vector
       LIMIT $3`,
      [JSON.stringify(questionEmbedding), policyIds, limit]
    );
    
    return result.rows;
  },

  /**
   * Recherche sémantique dans central_cg
   * @param questionEmbedding - Embedding de la question
   * @param insurers - Liste d'assureurs à filtrer (optionnel)
   * @param limit - Nombre max de résultats
   * @returns Documents CG pertinents
   */
  searchCentralCg: async (questionEmbedding: number[], insurers?: string[], limit: number = 3) => {
    // Recherche sémantique dans les pages vectorisées (granulaire) ET dans central_cg (global)
    // Priorité : central_cg_pages si disponibles (meilleure précision), sinon central_cg
    let queryText = `
      SELECT
        cg.insurer_code,
        cg.insurance_type_code,
        cg.metadata->>'productName' as product_name,
        p.content_text,
        p.chunk_type,
        p.guarantee_codes,
        p.article_ref,
        p.page_number,
        COALESCE(i.label, cg.insurer_code) as insurer_label,
        COALESCE(it.label_fr, cg.insurance_type_code) as type,
        1 - (p.embedding <=> $1::vector) as similarity
      FROM central_cg_pages p
      JOIN central_cg cg ON p.central_cg_id = cg.id
      LEFT JOIN insurers i ON cg.insurer_code = i.code
      LEFT JOIN insurance_types it ON cg.insurance_type_code = it.code
      WHERE p.embedding IS NOT NULL AND cg.status = 'active'
    `;

    const params: any[] = [JSON.stringify(questionEmbedding)];

    if (insurers && insurers.length > 0) {
      params.push(insurers);
      queryText += ` AND cg.insurer_code = ANY($${params.length})`;
    }

    queryText += ` ORDER BY p.embedding <=> $1::vector LIMIT $${params.length + 1}`;
    params.push(limit);

    let result = await query(queryText, params);

    // Fallback sur central_cg.embedding si aucune page vectorisée
    if (result.rows.length === 0) {
      let fallbackQuery = `
        SELECT
          cg.insurer_code,
          cg.insurance_type_code,
          cg.metadata->>'productName' as product_name,
          cg.content_text,
          'general' as chunk_type,
          '{}' as guarantee_codes,
          NULL as article_ref,
          0 as page_number,
          COALESCE(i.label, cg.insurer_code) as insurer_label,
          COALESCE(it.label_fr, cg.insurance_type_code) as type,
          1 - (cg.embedding <=> $1::vector) as similarity
        FROM central_cg cg
        LEFT JOIN insurers i ON cg.insurer_code = i.code
        LEFT JOIN insurance_types it ON cg.insurance_type_code = it.code
        WHERE cg.embedding IS NOT NULL AND cg.status = 'active'
      `;
      const fallbackParams: any[] = [JSON.stringify(questionEmbedding)];
      if (insurers && insurers.length > 0) {
        fallbackParams.push(insurers);
        fallbackQuery += ` AND cg.insurer_code = ANY($${fallbackParams.length})`;
      }
      fallbackQuery += ` ORDER BY cg.embedding <=> $1::vector LIMIT $${fallbackParams.length + 1}`;
      fallbackParams.push(limit);
      result = await query(fallbackQuery, fallbackParams);
    }

    return result.rows;
  }
};
