/**
 * Service pour accéder aux données de référence (Master Data)
 */

import { query } from '../db';
import {
  InsuranceType,
  InsuranceTypeCode,
  InsuranceSubType,
  InsuranceSubTypeCode,
  DocumentType,
} from '../types/masterData';

export const masterDataService = {
  /**
   * Récupère tous les types d'assurances actifs
   */
  getInsuranceTypes: async (): Promise<InsuranceType[]> => {
    const result = await query(
      `SELECT code, label_fr as "labelFr", label_en as "labelEn", 
              description, icon, color, display_order as "displayOrder", is_active as "isActive"
       FROM insurance_types 
       WHERE is_active = true 
       ORDER BY display_order`,
      []
    );
    return result.rows;
  },

  /**
   * Récupère un type d'assurance par son code
   */
  getInsuranceTypeByCode: async (code: InsuranceTypeCode): Promise<InsuranceType | null> => {
    const result = await query(
      `SELECT code, label_fr as "labelFr", label_en as "labelEn", 
              description, icon, color, display_order as "displayOrder", is_active as "isActive"
       FROM insurance_types 
       WHERE code = $1`,
      [code]
    );
    return result.rows[0] || null;
  },

  /**
   * Crée ou met à jour un type d'assurance
   */
  upsertInsuranceType: async (data: Partial<InsuranceType> & { code: string }): Promise<void> => {
    await query(
      `INSERT INTO insurance_types (code, label_fr, label_en, description, icon, color, display_order, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (code) 
       DO UPDATE SET 
         label_fr = EXCLUDED.label_fr,
         label_en = EXCLUDED.label_en,
         description = EXCLUDED.description,
         icon = EXCLUDED.icon,
         color = EXCLUDED.color,
         display_order = EXCLUDED.display_order,
         is_active = EXCLUDED.is_active,
         updated_at = CURRENT_TIMESTAMP`,
      [
        data.code,
        data.labelFr,
        data.labelEn || null,
        data.description || null,
        data.icon || null,
        data.color || null,
        data.displayOrder || 0,
        data.isActive !== undefined ? data.isActive : true
      ]
    );
  },

  /**
   * Récupère tous les assureurs actifs
   */
  getInsurers: async (): Promise<any[]> => {
    const result = await query(
      `SELECT code, label, full_name as "fullName", description, 
              logo_url as "logoUrl", website_url as "websiteUrl", 
              phone, email, color, display_order as "displayOrder", 
              is_active as "isActive"
       FROM insurers 
       WHERE is_active = true 
       ORDER BY display_order`,
      []
    );
    return result.rows;
  },

  /**
   * Récupère un assureur par son code
   */
  getInsurerByCode: async (code: string): Promise<any | null> => {
    const result = await query(
      `SELECT code, label, full_name as "fullName", description, 
              logo_url as "logoUrl", website_url as "websiteUrl", 
              phone, email, color, display_order as "displayOrder", 
              is_active as "isActive"
       FROM insurers 
       WHERE code = $1`,
      [code]
    );
    return result.rows[0] || null;
  },

  /**
   * Récupère les assureurs disponibles pour un type d'assurance donné
   */
  getInsurersByType: async (insuranceTypeCode: string): Promise<any[]> => {
    const result = await query(
      `SELECT i.code, i.label, i.full_name as "fullName", i.description, 
              i.logo_url as "logoUrl", i.website_url as "websiteUrl", 
              i.phone, i.email, i.color, i.display_order as "displayOrder", 
              i.is_active as "isActive"
       FROM insurers i
       INNER JOIN insurers_insurance_types iit ON i.code = iit.insurer_code
       WHERE iit.insurance_type_code = $1 
         AND i.is_active = true
       ORDER BY i.display_order`,
      [insuranceTypeCode]
    );
    return result.rows;
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Sous-types d'assurance
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Récupère tous les sous-types actifs (optionnellement filtrés par type parent)
   */
  getInsuranceSubTypes: async (parentTypeCode?: InsuranceTypeCode): Promise<InsuranceSubType[]> => {
    const params: any[] = [];
    let where = 'WHERE ist.is_active = true';
    if (parentTypeCode) {
      params.push(parentTypeCode);
      where += ` AND ist.parent_type_code = $${params.length}`;
    }
    const result = await query(
      `SELECT
         ist.code,
         ist.parent_type_code  AS "parentTypeCode",
         ist.label_fr          AS "labelFr",
         ist.label_en          AS "labelEn",
         ist.description,
         ist.icon,
         ist.color,
         ist.display_order     AS "displayOrder",
         ist.is_active         AS "isActive"
       FROM insurance_sub_types ist
       ${where}
       ORDER BY ist.parent_type_code, ist.display_order`,
      params
    );
    return result.rows;
  },

  /**
   * Récupère un sous-type par son code
   */
  getInsuranceSubTypeByCode: async (code: InsuranceSubTypeCode): Promise<InsuranceSubType | null> => {
    const result = await query(
      `SELECT
         code,
         parent_type_code  AS "parentTypeCode",
         label_fr          AS "labelFr",
         label_en          AS "labelEn",
         description,
         icon,
         color,
         display_order     AS "displayOrder",
         is_active         AS "isActive"
       FROM insurance_sub_types
       WHERE code = $1`,
      [code]
    );
    return result.rows[0] || null;
  },

  /**
   * Crée ou met à jour un sous-type d'assurance
   */
  upsertInsuranceSubType: async (
    data: Partial<InsuranceSubType> & { code: string; parentTypeCode: string }
  ): Promise<void> => {
    await query(
      `INSERT INTO insurance_sub_types
         (code, parent_type_code, label_fr, label_en, description, icon, color, display_order, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (code) DO UPDATE SET
         parent_type_code = EXCLUDED.parent_type_code,
         label_fr         = EXCLUDED.label_fr,
         label_en         = EXCLUDED.label_en,
         description      = EXCLUDED.description,
         icon             = EXCLUDED.icon,
         color            = EXCLUDED.color,
         display_order    = EXCLUDED.display_order,
         is_active        = EXCLUDED.is_active,
         updated_at       = CURRENT_TIMESTAMP`,
      [
        data.code,
        data.parentTypeCode,
        data.labelFr,
        data.labelEn     || null,
        data.description || null,
        data.icon        || null,
        data.color       || null,
        data.displayOrder ?? 0,
        data.isActive !== undefined ? data.isActive : true,
      ]
    );
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Types de documents
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Récupère tous les types de documents actifs
   */
  getDocumentTypes: async (): Promise<DocumentType[]> => {
    const result = await query(
      `SELECT
         code,
         label_fr      AS "labelFr",
         label_en      AS "labelEn",
         description,
         display_order AS "displayOrder",
         is_active     AS "isActive"
       FROM document_types
       WHERE is_active = true
       ORDER BY display_order`,
      []
    );
    return result.rows;
  },

  /**
   * Récupère un type de document par son code
   */
  getDocumentTypeByCode: async (code: string): Promise<DocumentType | null> => {
    const result = await query(
      `SELECT
         code,
         label_fr      AS "labelFr",
         label_en      AS "labelEn",
         description,
         display_order AS "displayOrder",
         is_active     AS "isActive"
       FROM document_types
       WHERE code = $1`,
      [code]
    );
    return result.rows[0] || null;
  },
};
