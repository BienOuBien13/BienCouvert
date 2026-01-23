"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.storage = void 0;
const db_1 = require("./db");
// -----------------------------------------------------------------------------
// Module de stockage PostgreSQL pour AssurClair
// Ce module expose des fonctions pour interagir avec la base de données PostgreSQL
// sur la VM Azure. Remplace l'ancien système de fichiers JSON.
// -----------------------------------------------------------------------------
exports.storage = {
    /**
     * Lit la liste des utilisateurs depuis la table users
     * @returns Promise avec tableau d'objets utilisateur
     */
    readUsers: async () => {
        const result = await (0, db_1.query)('SELECT * FROM users ORDER BY id');
        return result.rows.map(row => ({
            id: row.id,
            email: row.email,
            name: row.name,
            password: row.password,
            profile: row.profile ? JSON.parse(row.profile) : null,
            isAdmin: row.is_admin
        }));
    },
    /**
     * Écrit/Met à jour un utilisateur dans la table users
     * @param data - Objet utilisateur à sauvegarder
     */
    writeUser: async (data) => {
        const { id, email, name, password, profile, isAdmin } = data;
        const profileStr = profile ? JSON.stringify(profile) : null;
        if (id) {
            // Mise à jour
            await (0, db_1.query)(`UPDATE users 
         SET email = $1, name = $2, password = $3, profile = $4, is_admin = $5, updated_at = CURRENT_TIMESTAMP
         WHERE id = $6`, [email, name, password, profileStr, isAdmin || false, id]);
        }
        else {
            // Insertion
            const result = await (0, db_1.query)(`INSERT INTO users (email, name, password, profile, is_admin)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`, [email, name, password, profileStr, isAdmin || false]);
            return result.rows[0].id;
        }
    },
    /**
     * Écrit la liste complète des utilisateurs (pour migration)
     * @param data - Tableau d'utilisateurs à sauvegarder
     */
    writeUsers: async (data) => {
        for (const user of data) {
            await exports.storage.writeUser(user);
        }
    },
    /**
     * Lit la liste des polices d'assurance depuis la table policies
     * @param userId - (Optionnel) ID de l'utilisateur pour filtrer ses polices
     * @returns Promise avec tableau d'objets police
     */
    readPolicies: async (userId) => {
        let queryText = 'SELECT * FROM policies';
        const params = [];
        if (userId) {
            queryText += ' WHERE user_id = $1';
            params.push(userId);
        }
        queryText += ' ORDER BY id';
        const result = await (0, db_1.query)(queryText, params);
        return result.rows.map(row => ({
            id: row.id,
            userId: row.user_id,
            policyNumber: row.policy_number,
            insurer: row.insurer,
            type: row.type,
            premium: row.premium ? parseFloat(row.premium) : null,
            coverage: row.coverage ? parseFloat(row.coverage) : null,
            startDate: row.start_date,
            endDate: row.end_date,
            status: row.status,
            documentUrl: row.document_url,
            documentData: row.document_data,
            metadata: row.metadata
        }));
    },
    /**
     * Écrit/Met à jour une police dans la table policies
     * @param data - Objet police à sauvegarder
     */
    writePolicy: async (data) => {
        const { id, userId, policyNumber, insurer, type, premium, coverage, startDate, endDate, status, documentUrl, documentData, metadata } = data;
        if (id) {
            // Mise à jour
            await (0, db_1.query)(`UPDATE policies 
         SET user_id = $1, policy_number = $2, insurer = $3, type = $4, 
             premium = $5, coverage = $6, start_date = $7, end_date = $8,
             status = $9, document_url = $10, document_data = $11, 
             metadata = $12, updated_at = CURRENT_TIMESTAMP
         WHERE id = $13`, [userId, policyNumber, insurer, type, premium, coverage, startDate,
                endDate, status, documentUrl, documentData, metadata, id]);
        }
        else {
            // Insertion
            const result = await (0, db_1.query)(`INSERT INTO policies 
         (user_id, policy_number, insurer, type, premium, coverage, 
          start_date, end_date, status, document_url, document_data, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id`, [userId, policyNumber, insurer, type, premium, coverage, startDate,
                endDate, status || 'active', documentUrl, documentData, metadata]);
            return result.rows[0].id;
        }
    },
    /**
     * Écrit la liste complète des polices (pour migration)
     * @param data - Tableau de polices à sauvegarder
     */
    writePolicies: async (data) => {
        for (const policy of data) {
            await exports.storage.writePolicy(policy);
        }
    },
    /**
     * Lit le référentiel central des CG depuis la table central_cg
     * @returns Promise avec tableau d'entrées CG
     */
    readCentralCg: async () => {
        const result = await (0, db_1.query)('SELECT * FROM central_cg ORDER BY id');
        return result.rows.map(row => ({
            id: row.id,
            insurer: row.insurer,
            productName: row.product_name,
            version: row.version,
            documentUrl: row.document_url,
            documentHash: row.document_hash,
            contentText: row.content_text,
            embedding: row.embedding,
            metadata: row.metadata
        }));
    },
    /**
     * Écrit/Met à jour une entrée CG dans la table central_cg
     * @param data - Objet CG à sauvegarder
     */
    writeCentralCgEntry: async (data) => {
        const { id, insurer, productName, version, documentUrl, documentHash, contentText, embedding, metadata } = data;
        if (id) {
            // Mise à jour
            await (0, db_1.query)(`UPDATE central_cg 
         SET insurer = $1, product_name = $2, version = $3, document_url = $4,
             document_hash = $5, content_text = $6, embedding = $7, 
             metadata = $8, updated_at = CURRENT_TIMESTAMP
         WHERE id = $9`, [insurer, productName, version, documentUrl, documentHash,
                contentText, embedding, metadata, id]);
        }
        else {
            // Insertion
            const result = await (0, db_1.query)(`INSERT INTO central_cg 
         (insurer, product_name, version, document_url, document_hash, 
          content_text, embedding, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`, [insurer, productName, version, documentUrl, documentHash,
                contentText, embedding, metadata]);
            return result.rows[0].id;
        }
    },
    /**
     * Écrit le référentiel central des CG (pour migration)
     * @param data - Tableau d'entrées CG à sauvegarder
     */
    writeCentralCg: async (data) => {
        for (const cg of data) {
            await exports.storage.writeCentralCgEntry(cg);
        }
    },
    /**
     * Supprime une police par son ID
     * @param id - ID de la police à supprimer
     */
    deletePolicy: async (id) => {
        await (0, db_1.query)('DELETE FROM policies WHERE id = $1', [id]);
    },
    /**
     * Supprime une entrée CG par son ID
     * @param id - ID de l'entrée CG à supprimer
     */
    deleteCentralCgEntry: async (id) => {
        await (0, db_1.query)('DELETE FROM central_cg WHERE id = $1', [id]);
    }
};
