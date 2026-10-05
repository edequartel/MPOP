import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createUserAdminHandler } from "./handler.js";

serve(createUserAdminHandler({ createClient, env: (key: string) => Deno.env.get(key) }));
