export type ActionResult = {
  ok: boolean;
  message: string;
};

export type SettingRequest = {
  id: string;
  space_id: string;
  requester_id: string;
  setting_type: "space_name" | "relationship_started_on";
  current_value: string;
  proposed_value: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  created_at: string;
  responded_at?: string;
  responder_id?: string;
  cancelled_at?: string;
};
