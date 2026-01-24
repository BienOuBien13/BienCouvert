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
      isAdmin: row.is_admin
    })) as T[];
  },

  /**
   * Écrit/Met à jour un utilisateur dans la table users
   * @param data - Objet utilisateur à sauvegarder
   */
  writeUser: async (data: any) => {
    const { id, email, firstName, lastName, password, profile, isAdmin } = data;
    const profileStr = profile ? JSON.stringify(profile) : null;
    
    if (id) {
      // Mise à jour
      const result = await query(
        `UPDATE users 
         SET email = $1, first_name = $2, last_name = $3, password = $4, profile = $5, is_admin = $6, updated_at = CURRENT_TIMESTAMP
         WHERE id = $7
         RETURNING id`,
        [email, firstName, lastName, password, profileStr, isAdmin || false, id]
      );
      
      if (result.rows.length === 0) {
        throw new Error(`User with id ${id} not found for update`);
      }
      
      return result.rows[0].id;
    } else {
      // Insertion
      const result = await query(
        `INSERT INTO users (email, first_name, last_name, password, profile, is_admin)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [email, firstName, lastName, password, profileStr, isAdmin || false]
      );
      return result.rows[0].id;
    }
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
   * Lit la liste des polices d'assurance depuis la table policies
   * @param userId - (Optionnel) ID de l'utilisateur pour filtrer ses polices
   * @returns Promise avec tableau d'objets police
   */
  readPolicies: async <T = any>(userId?: number): Promise<T[]> => {
    let queryText = 'SELECT * FROM policies';
    const params: any[] = [];
    
    if (userId) {
      queryText += ' WHERE user_id = $1';
      params.push(userId);
    }
    
    queryText += ' ORDER BY id';
    
    const result = await query(queryText, params);
    return result.rows.map(row => {
      const metadata = row.metadata || {};
      return {
        id: row.id.toString(),
        userId: row.user_id.toString(),
        name: metadata.name || 'Contrat sans nom',
        provider: row.insurer || 'Non spécifié',
        type: row.type || 'Autre',
        coverageDetail: metadata.coverageDetail || null,
        options: metadata.options || [],
        fileData: row.document_data || null,
        fileName: metadata.fileName || null,
        sourceUrl: row.document_url || null,
        mimeType: metadata.mimeType || 'text/html',
        summary: metadata.summary || null,
        addedAt: row.start_date ? new Date(row.start_date).getTime() : Date.now(),
        annualPremium: row.premium ? parseFloat(row.premium) : undefined,
        isInternalSource: metadata.isInternalSource || false,
        // Garder aussi les propriétés natives pour compatibilité
        policyNumber: row.policy_number,
        premium: row.premium ? parseFloat(row.premium) : null,
        coverage: row.coverage ? parseFloat(row.coverage) : null,
        startDate: row.start_date,
        endDate: row.end_date,
        status: row.status,
        centralCgId: row.central_cg_id
      };
    }) as T[];
  },

  /**
   * Écrit/Met à jour une police dans la table policies
   * @param data - Objet police à sauvegarder
   */
  writePolicy: async (data: any) => {
    const { 
      id, userId, policyNumber, insurer, type, premium, coverage,
      startDate, endDate, status, documentUrl, documentData, metadata, centralCgId
    } = data;
    
    // Sérialiser metadata en JSON si c'est un objet
    const metadataJson = metadata ? JSON.stringify(metadata) : null;
    
    if (id) {
      // Mise à jour
      await query(
        `UPDATE policies 
         SET user_id = $1, policy_number = $2, insurer = $3, type = $4, 
             premium = $5, coverage = $6, start_date = $7, end_date = $8,
             status = $9, document_url = $10, document_data = $11, 
             metadata = $12, central_cg_id = $13, updated_at = CURRENT_TIMESTAMP
         WHERE id = $14`,
        [userId, policyNumber, insurer, type, premium, coverage, startDate, 
         endDate, status, documentUrl, documentData, metadataJson, centralCgId || null, id]
      );
    } else {
      // Insertion
      const result = await query(
        `INSERT INTO policies 
         (user_id, policy_number, insurer, type, premium, coverage, 
          start_date, end_date, status, document_url, document_data, metadata, central_cg_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING id`,
        [userId, policyNumber, insurer, type, premium, coverage, startDate, 
         endDate, status || 'active', documentUrl, documentData, metadataJson, centralCgId || null]
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
    const result = await query('SELECT * FROM central_cg ORDER BY id');
    return result.rows.map(row => ({
      id: row.id,
      provider: row.insurer,                    // Mapping insurer → provider pour le frontend
      policyName: row.product_name,             // Mapping product_name → policyName pour le frontend
      type: row.metadata?.type || 'Autre',     // Type depuis metadata
      version: row.version,
      documentUrl: row.document_url,
      documentHash: row.document_hash,
      contentText: row.content_text,
      embedding: row.embedding,
      indexedFormulas: row.metadata?.indexedFormulas || [],
      indexedOptions: row.metadata?.indexedOptions || [],
      semanticSummary: row.metadata?.semanticSummary || '',
      metadata: row.metadata,
      lastVerified: row.updated_at || row.created_at
    })) as T[];
  },

  /**
   * Écrit/Met à jour une entrée CG dans la table central_cg
   * @param data - Objet CG à sauvegarder
   */
  writeCentralCgEntry: async (data: any) => {
    const { 
      id, insurer, productName, version, documentUrl, 
      documentHash, contentText, embedding, metadata
    } = data;
    
    if (id) {
      // Mise à jour
      await query(
        `UPDATE central_cg 
         SET insurer = $1, product_name = $2, version = $3, document_url = $4,
             document_hash = $5, content_text = $6, embedding = $7, 
             metadata = $8, updated_at = CURRENT_TIMESTAMP
         WHERE id = $9`,
        [insurer, productName, version, documentUrl, documentHash, 
         contentText, embedding, metadata, id]
      );
    } else {
      // Insertion
      const result = await query(
        `INSERT INTO central_cg 
         (insurer, product_name, version, document_url, document_hash, 
          content_text, embedding, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [insurer, productName, version, documentUrl, documentHash, 
         contentText, embedding, metadata]
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
  }
};
