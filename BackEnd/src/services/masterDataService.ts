/**
 * Service pour accéder aux données de référence (Master Data)
 */

import { query } from '../db';
import { InsuranceType, InsuranceTypeCode } from '../types/masterData';

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
  }
};
