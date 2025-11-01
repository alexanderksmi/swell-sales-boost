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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      auth_sessions: {
        Row: {
          created_at: string
          expires_at: string
          session_key: string
          session_token: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          session_key: string
          session_token: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          session_key?: string
          session_token?: string
        }
        Relationships: []
      }
      calls: {
        Row: {
          created_at: string
          hs_created_by_user_id: string | null
          hs_timestamp: number | null
          hubspot_call_id: string
          hubspot_owner_id: string | null
          id: string
          owner_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          hs_created_by_user_id?: string | null
          hs_timestamp?: number | null
          hubspot_call_id: string
          hubspot_owner_id?: string | null
          id?: string
          owner_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          hs_created_by_user_id?: string | null
          hs_timestamp?: number | null
          hubspot_call_id?: string
          hubspot_owner_id?: string | null
          id?: string
          owner_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calls_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          created_at: string
          email: string | null
          firstname: string | null
          hubspot_contact_id: string
          id: string
          lastname: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          firstname?: string | null
          hubspot_contact_id: string
          id?: string
          lastname?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          firstname?: string | null
          hubspot_contact_id?: string
          id?: string
          lastname?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_stage_changes: {
        Row: {
          changed_at: string
          deal_id: string
          from_stage: string
          id: string
          owner_id: string | null
          tenant_id: string
          to_stage: string
        }
        Insert: {
          changed_at?: string
          deal_id: string
          from_stage: string
          id?: string
          owner_id?: string | null
          tenant_id: string
          to_stage: string
        }
        Update: {
          changed_at?: string
          deal_id?: string
          from_stage?: string
          id?: string
          owner_id?: string | null
          tenant_id?: string
          to_stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_stage_changes_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_stage_changes_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_stage_changes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          amount: number | null
          closedate: string | null
          contact_id: string | null
          created_at: string
          dealname: string | null
          dealstage: string | null
          hs_is_closed: boolean | null
          hs_lastmodifieddate: string | null
          hubspot_deal_id: string
          hubspot_owner_id: string | null
          id: string
          owner_id: string | null
          pipeline: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          closedate?: string | null
          contact_id?: string | null
          created_at?: string
          dealname?: string | null
          dealstage?: string | null
          hs_is_closed?: boolean | null
          hs_lastmodifieddate?: string | null
          hubspot_deal_id: string
          hubspot_owner_id?: string | null
          id?: string
          owner_id?: string | null
          pipeline?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          closedate?: string | null
          contact_id?: string | null
          created_at?: string
          dealname?: string | null
          dealstage?: string | null
          hs_is_closed?: boolean | null
          hs_lastmodifieddate?: string | null
          hubspot_deal_id?: string
          hubspot_owner_id?: string | null
          id?: string
          owner_id?: string | null
          pipeline?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      emails: {
        Row: {
          created_at: string
          hs_created_by_user_id: string | null
          hs_timestamp: number | null
          hubspot_email_id: string
          hubspot_owner_id: string | null
          id: string
          owner_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          hs_created_by_user_id?: string | null
          hs_timestamp?: number | null
          hubspot_email_id: string
          hubspot_owner_id?: string | null
          id?: string
          owner_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          hs_created_by_user_id?: string | null
          hs_timestamp?: number | null
          hubspot_email_id?: string
          hubspot_owner_id?: string | null
          id?: string
          owner_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "emails_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      hubspot_tokens: {
        Row: {
          access_token: string
          created_at: string
          expires_at: string
          id: string
          refresh_token: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          access_token: string
          created_at?: string
          expires_at: string
          id?: string
          refresh_token: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          created_at?: string
          expires_at?: string
          id?: string
          refresh_token?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hubspot_tokens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      leaderboard_categories: {
        Row: {
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          sort_order: number | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          sort_order?: number | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          sort_order?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leaderboard_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          created_at: string
          hs_created_by_user_id: string | null
          hs_timestamp: number | null
          hubspot_meeting_id: string
          hubspot_owner_id: string | null
          id: string
          owner_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          hs_created_by_user_id?: string | null
          hs_timestamp?: number | null
          hubspot_meeting_id: string
          hubspot_owner_id?: string | null
          id?: string
          owner_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          hs_created_by_user_id?: string | null
          hs_timestamp?: number | null
          hubspot_meeting_id?: string
          hubspot_owner_id?: string | null
          id?: string
          owner_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetings_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_states: {
        Row: {
          client_state: string
          created_at: string
          expires_at: string
          frontend_url: string
          id: string
          state_value: string
          used: boolean
        }
        Insert: {
          client_state: string
          created_at?: string
          expires_at?: string
          frontend_url: string
          id?: string
          state_value: string
          used?: boolean
        }
        Update: {
          client_state?: string
          created_at?: string
          expires_at?: string
          frontend_url?: string
          id?: string
          state_value?: string
          used?: boolean
        }
        Relationships: []
      }
      org_defaults: {
        Row: {
          created_at: string
          id: string
          setting_key: string
          setting_value: Json
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          setting_key: string
          setting_value: Json
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          setting_key?: string
          setting_value?: Json
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_defaults_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      points_ledger: {
        Row: {
          category_id: string
          created_at: string
          id: string
          metadata: Json | null
          points: number
          rule_set_id: string | null
          source: string | null
          tenant_id: string
          user_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          points: number
          rule_set_id?: string | null
          source?: string | null
          tenant_id: string
          user_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          points?: number
          rule_set_id?: string | null
          source?: string | null
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "points_ledger_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_ledger_rule_set_id_fkey"
            columns: ["rule_set_id"]
            isOneToOne: false
            referencedRelation: "scoring_rule_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_ledger_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      scoring_rule_sets: {
        Row: {
          category_id: string
          created_at: string
          hubspot_property: string
          id: string
          is_active: boolean | null
          name: string
          points_per_unit: number | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          hubspot_property: string
          id?: string
          is_active?: boolean | null
          name: string
          points_per_unit?: number | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          hubspot_property?: string
          id?: string
          is_active?: boolean | null
          name?: string
          points_per_unit?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scoring_rule_sets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scoring_rule_sets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          description: string | null
          hubspot_team_id: string | null
          id: string
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          hubspot_team_id?: string | null
          id?: string
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          hubspot_team_id?: string | null
          id?: string
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          company_name: string
          created_at: string
          hubspot_portal_id: string | null
          id: string
          portal_id: string
          updated_at: string
        }
        Insert: {
          company_name: string
          created_at?: string
          hubspot_portal_id?: string | null
          id?: string
          portal_id: string
          updated_at?: string
        }
        Update: {
          company_name?: string
          created_at?: string
          hubspot_portal_id?: string | null
          id?: string
          portal_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_overrides: {
        Row: {
          created_at: string
          id: string
          setting_key: string
          setting_value: Json
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          setting_key: string
          setting_value: Json
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          setting_key?: string
          setting_value?: Json
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_overrides_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_teams: {
        Row: {
          created_at: string | null
          id: string
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_teams_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_teams_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          hs_owner_id: string | null
          hubspot_user_id: string | null
          id: string
          is_active: boolean | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          hs_owner_id?: string | null
          hubspot_user_id?: string | null
          id?: string
          is_active?: boolean | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          hs_owner_id?: string | null
          hubspot_user_id?: string | null
          id?: string
          is_active?: boolean | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_tenant_id_fkey"
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
      get_tenant_id_from_jwt: { Args: never; Returns: string }
      get_user_id_from_jwt: { Args: never; Returns: string }
      get_user_tenant_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "org_admin" | "sales_rep"
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
      app_role: ["org_admin", "sales_rep"],
    },
  },
} as const
