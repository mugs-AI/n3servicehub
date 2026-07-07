export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          after_value: Json | null
          before_value: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          result: string | null
          tenant_id: string
          user_code: string | null
          user_type: string | null
        }
        Insert: {
          action: string
          after_value?: Json | null
          before_value?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          result?: string | null
          tenant_id: string
          user_code?: string | null
          user_type?: string | null
        }
        Update: {
          action?: string
          after_value?: Json | null
          before_value?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          result?: string | null
          tenant_id?: string
          user_code?: string | null
          user_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_contract_snapshots: {
        Row: {
          contract_days: number | null
          contract_status: string
          created_at: string
          expiry_date: string | null
          id: string
          last_calculated_at: string | null
          latest_contract_date: string | null
          latest_contract_document_id: string | null
          latest_contract_document_no: string | null
          latest_contract_source: string | null
          latest_contract_stock_code: string | null
          n3_customer_code: string
          n3_customer_id: string | null
          n3_customer_name: string | null
          remaining_days: number | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          contract_days?: number | null
          contract_status?: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          last_calculated_at?: string | null
          latest_contract_date?: string | null
          latest_contract_document_id?: string | null
          latest_contract_document_no?: string | null
          latest_contract_source?: string | null
          latest_contract_stock_code?: string | null
          n3_customer_code: string
          n3_customer_id?: string | null
          n3_customer_name?: string | null
          remaining_days?: number | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          contract_days?: number | null
          contract_status?: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          last_calculated_at?: string | null
          latest_contract_date?: string | null
          latest_contract_document_id?: string | null
          latest_contract_document_no?: string | null
          latest_contract_source?: string | null
          latest_contract_stock_code?: string | null
          n3_customer_code?: string
          n3_customer_id?: string | null
          n3_customer_name?: string | null
          remaining_days?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_contract_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      job_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_url: string
          id: string
          job_id: string
          tenant_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_name: string
          file_url: string
          id?: string
          job_id: string
          tenant_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          file_url?: string
          id?: string
          job_id?: string
          tenant_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_attachments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_attachments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users_local"
            referencedColumns: ["id"]
          },
        ]
      }
      job_comments: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          is_internal: boolean
          job_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          is_internal?: boolean
          job_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          is_internal?: boolean
          job_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users_local"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_comments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_comments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      job_number_sequences: {
        Row: {
          last_value: number
          seq_date: string
          tenant_id: string
        }
        Insert: {
          last_value?: number
          seq_date: string
          tenant_id: string
        }
        Update: {
          last_value?: number
          seq_date?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_number_sequences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          actual_end: string | null
          actual_start: string | null
          approval_note: string | null
          approval_required: boolean
          approval_status: string
          approval_type: string | null
          approved_at: string | null
          approved_by: string | null
          assigned_to: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          job_no: string
          job_service_type: string | null
          n3_customer_code: string | null
          n3_customer_id: string | null
          n3_customer_name: string | null
          n3_delivery_order_id: string | null
          n3_sales_invoice_id: string | null
          n3_stock_code: string | null
          n3_stock_id: string | null
          priority: string
          scheduled_end: string | null
          scheduled_start: string | null
          status: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          actual_end?: string | null
          actual_start?: string | null
          approval_note?: string | null
          approval_required?: boolean
          approval_status?: string
          approval_type?: string | null
          approved_at?: string | null
          approved_by?: string | null
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          job_no: string
          job_service_type?: string | null
          n3_customer_code?: string | null
          n3_customer_id?: string | null
          n3_customer_name?: string | null
          n3_delivery_order_id?: string | null
          n3_sales_invoice_id?: string | null
          n3_stock_code?: string | null
          n3_stock_id?: string | null
          priority?: string
          scheduled_end?: string | null
          scheduled_start?: string | null
          status?: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          actual_end?: string | null
          actual_start?: string | null
          approval_note?: string | null
          approval_required?: boolean
          approval_status?: string
          approval_type?: string | null
          approved_at?: string | null
          approved_by?: string | null
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          job_no?: string
          job_service_type?: string | null
          n3_customer_code?: string | null
          n3_customer_id?: string | null
          n3_customer_name?: string | null
          n3_delivery_order_id?: string | null
          n3_sales_invoice_id?: string | null
          n3_stock_code?: string | null
          n3_stock_id?: string | null
          priority?: string
          scheduled_end?: string | null
          scheduled_start?: string | null
          status?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users_local"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users_local"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users_local"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          entity_id: string | null
          entity_table: string | null
          id: string
          is_read: boolean
          read_at: string | null
          recipient_id: string
          tenant_id: string
          title: string
          type: Database["public"]["Enums"]["notification_type"]
        }
        Insert: {
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_table?: string | null
          id?: string
          is_read?: boolean
          read_at?: string | null
          recipient_id: string
          tenant_id: string
          title: string
          type: Database["public"]["Enums"]["notification_type"]
        }
        Update: {
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_table?: string | null
          id?: string
          is_read?: boolean
          read_at?: string | null
          recipient_id?: string
          tenant_id?: string
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
        }
        Relationships: [
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "users_local"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      reminder_rules: {
        Row: {
          created_at: string
          days_before_expiry: number
          id: string
          is_active: boolean
          rule_name: string | null
          status_to_apply: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          days_before_expiry: number
          id?: string
          is_active?: boolean
          rule_name?: string | null
          status_to_apply: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          days_before_expiry?: number
          id?: string
          is_active?: boolean
          rule_name?: string | null
          status_to_apply?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      renewal_mapping: {
        Row: {
          contract_days: number | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          n3_stock_code: string | null
          n3_stock_id: string
          n3_stock_name: string | null
          notes: string | null
          service_type: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          contract_days?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          n3_stock_code?: string | null
          n3_stock_id: string
          n3_stock_name?: string | null
          notes?: string | null
          service_type?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          contract_days?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          n3_stock_code?: string | null
          n3_stock_id?: string
          n3_stock_name?: string | null
          notes?: string | null
          service_type?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "renewal_mapping_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users_local"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renewal_mapping_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          id: string
          n3_api_key_ref: string | null
          n3_company_name: string | null
          n3_tenant_code: string | null
          name: string
          slug: string
          status: Database["public"]["Enums"]["tenant_status"]
          tenant_id: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          n3_api_key_ref?: string | null
          n3_company_name?: string | null
          n3_tenant_code?: string | null
          name: string
          slug: string
          status?: Database["public"]["Enums"]["tenant_status"]
          tenant_id?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          n3_api_key_ref?: string | null
          n3_company_name?: string | null
          n3_tenant_code?: string | null
          name?: string
          slug?: string
          status?: Database["public"]["Enums"]["tenant_status"]
          tenant_id?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      users_local: {
        Row: {
          auth_user_id: string
          created_at: string
          display_name: string | null
          email: string
          id: string
          is_active: boolean
          last_login_at: string | null
          n3_user_id: string | null
          role: Database["public"]["Enums"]["user_local_role"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          auth_user_id: string
          created_at?: string
          display_name?: string | null
          email: string
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          n3_user_id?: string | null
          role?: Database["public"]["Enums"]["user_local_role"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          auth_user_id?: string
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          n3_user_id?: string | null
          role?: Database["public"]["Enums"]["user_local_role"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_local_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_tenant_role: {
        Args: {
          _roles: Database["public"]["Enums"]["user_local_role"][]
          _tenant_id: string
        }
        Returns: boolean
      }
      is_tenant_member: { Args: { _tenant_id: string }; Returns: boolean }
    }
    Enums: {
      notification_type:
        | "job_assigned"
        | "job_updated"
        | "job_comment"
        | "renewal_due"
        | "system"
      tenant_status: "active" | "suspended" | "trial" | "cancelled"
      user_local_role: "owner" | "admin" | "manager" | "technician" | "viewer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      notification_type: [
        "job_assigned",
        "job_updated",
        "job_comment",
        "renewal_due",
        "system",
      ],
      tenant_status: ["active", "suspended", "trial", "cancelled"],
      user_local_role: ["owner", "admin", "manager", "technician", "viewer"],
    },
  },
} as const
