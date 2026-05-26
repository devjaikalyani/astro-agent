export type SSEEvent =
  | { type: "status"; message: string }
  | { type: "text_delta"; text: string }
  | { type: "tool_call"; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; name: string; object_type?: string; object_name?: string }
  | { type: "done"; cache_read?: number; output_tokens?: number }
  | { type: "error"; message: string };

export type ObjectType =
  | "planet"
  | "ringed_planet"
  | "star"
  | "moon"
  | "asteroid"
  | "comet"
  | "nebula"
  | "black_hole"
  | "galaxy"
  | null;

export const OBJECT_COLORS: Record<string, string> = {
  planet: "#4a9eff",
  ringed_planet: "#e8c87a",
  star: "#ffcc44",
  moon: "#b0b8c8",
  asteroid: "#c4956a",
  comet: "#88ddff",
  nebula: "#cc44ff",
  black_hole: "#220033",
  galaxy: "#ff8844",
};

export const TOOL_LABELS: Record<string, string> = {
  classify_celestial_body: "Classifying object",
  get_celestial_info: "Fetching data",
  search_by_property: "Searching database",
  compare_celestial_bodies: "Running comparison",
  list_object_types: "Listing objects",
};
