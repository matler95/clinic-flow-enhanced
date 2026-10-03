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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_label: string | null
          actor_user_id: string | null
          created_at: string
          id: string
          org_id: string | null
          target: string | null
        }
        Insert: {
          action: string
          actor_label?: string | null
          actor_user_id?: string | null
          created_at?: string
          id?: string
          org_id?: string | null
          target?: string | null
        }
        Update: {
          action?: string
          actor_label?: string | null
          actor_user_id?: string | null
          created_at?: string
          id?: string
          org_id?: string | null
          target?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      drop_links: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          label: string
          max_uses: number | null
          org_id: string
          recipient_user_id: string | null
          revoked_at: string | null
          token_hash: string
          uses: number
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          label?: string
          max_uses?: number | null
          org_id: string
          recipient_user_id?: string | null
          revoked_at?: string | null
          token_hash: string
          uses?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          label?: string
          max_uses?: number | null
          org_id?: string
          recipient_user_id?: string | null
          revoked_at?: string | null
          token_hash?: string
          uses?: number
        }
        Relationships: [
          {
            foreignKeyName: "drop_links_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          declined_at: string | null
          email: string
          id: string
          invited_by: string
          org_id: string
          role: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          declined_at?: string | null
          email: string
          id?: string
          invited_by: string
          org_id: string
          role?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          declined_at?: string | null
          email?: string
          id?: string
          invited_by?: string
          org_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          archived_at: string | null
          created_at: string
          direction: string
          drop_link_id: string | null
          expires_at: string
          file_name: string
          first_opened_at: string | null
          id: string
          important: boolean
          mime_type: string
          note: string | null
          org_id: string
          read_at: string | null
          recipient_user_id: string | null
          scan_status: string
          sender_name: string | null
          size_bytes: number
          storage_path: string
          substitute_for: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          direction?: string
          drop_link_id?: string | null
          expires_at?: string
          file_name: string
          first_opened_at?: string | null
          id?: string
          important?: boolean
          mime_type?: string
          note?: string | null
          org_id: string
          read_at?: string | null
          recipient_user_id?: string | null
          scan_status?: string
          sender_name?: string | null
          size_bytes?: number
          storage_path: string
          substitute_for?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          direction?: string
          drop_link_id?: string | null
          expires_at?: string
          file_name?: string
          first_opened_at?: string | null
          id?: string
          important?: boolean
          mime_type?: string
          note?: string | null
          org_id?: string
          read_at?: string | null
          recipient_user_id?: string | null
          scan_status?: string
          sender_name?: string | null
          size_bytes?: number
          storage_path?: string
          substitute_for?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "items_drop_link_id_fkey"
            columns: ["drop_link_id"]
            isOneToOne: false
            referencedRelation: "drop_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          org_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          org_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications_outbox: {
        Row: {
          body: string
          channel: string
          created_at: string
          id: string
          status: string
          user_id: string
        }
        Insert: {
          body: string
          channel: string
          created_at?: string
          id?: string
          status?: string
          user_id: string
        }
        Update: {
          body?: string
          channel?: string
          created_at?: string
          id?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          kind: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      substitutions: {
        Row: {
          absent_user_id: string
          cancelled_at: string | null
          created_at: string
          created_by: string
          ends_at: string
          id: string
          org_id: string
          reason: string | null
          starts_at: string
          substitute_user_id: string
        }
        Insert: {
          absent_user_id: string
          cancelled_at?: string | null
          created_at?: string
          created_by: string
          ends_at: string
          id?: string
          org_id: string
          reason?: string | null
          starts_at: string
          substitute_user_id: string
        }
        Update: {
          absent_user_id?: string
          cancelled_at?: string | null
          created_at?: string
          created_by?: string
          ends_at?: string
          id?: string
          org_id?: string
          reason?: string | null
          starts_at?: string
          substitute_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "substitutions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _offboard: {
        Args: { _action: string; _actor: string; _org: string; _target: string }
        Returns: number
      }
      assign_item: {
        Args: { _doctor_id: string; _item_id: string }
        Returns: string
      }
      cancel_substitution: { Args: { _id: string }; Returns: undefined }
      consume_drop_link: { Args: { _id: string }; Returns: boolean }
      create_organization: {
        Args: { _kind?: string; _name: string }
        Returns: string
      }
      create_substitution: {
        Args: {
          _absent: string
          _ends: string
          _org: string
          _reason: string
          _starts: string
          _substitute: string
        }
        Returns: string
      }
      deactivate_member: {
        Args: { _org: string; _target_user: string }
        Returns: number
      }
      has_org_role: {
        Args: { _org: string; _role: string; _uid: string }
        Returns: boolean
      }
      is_member: { Args: { _org: string; _uid: string }; Returns: boolean }
      leave_organization: { Args: { _org: string }; Returns: undefined }
      resolve_recipient: {
        Args: { _doctor: string; _org: string }
        Returns: string
      }
      respond_invitation: {
        Args: { _accept: boolean; _id: string }
        Returns: string
      }
      set_member_role: {
        Args: { _membership: string; _role: string }
        Returns: undefined
      }
      shares_org: { Args: { _a: string; _b: string }; Returns: boolean }
      transfer_item: {
        Args: { _item_id: string; _note: string; _target_doctor: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
