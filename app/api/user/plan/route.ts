import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError) {
      console.error("Auth error in plan selection:", authError);
      return NextResponse.json(
        { error: "Authentication error", details: authError.message },
        { status: 401 }
      );
    }

    if (!user) {
      console.error("No user found in plan selection API");
      return NextResponse.json(
        { error: "Unauthorized - No user session found" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { plan } = body;

    if (!plan || (plan !== "free" && plan !== "pro")) {
      return NextResponse.json(
        { error: "Invalid plan selection" },
        { status: 400 }
      );
    }

    // First check if user exists
    let existingUser;
    let fetchError;
    
    try {
      const fetchResult = await supabase
        .from("users")
        .select("*")
        .eq("id", user.id)
        .single();
      existingUser = fetchResult.data;
      fetchError = fetchResult.error;
    } catch (err) {
      console.error("Exception checking if user exists:", err);
      return NextResponse.json(
        { error: "Failed to check user record", details: err instanceof Error ? err.message : "Unknown error" },
        { status: 500 }
      );
    }
    
    // If fetchError exists and it's NOT "record not found", that's a real error
    if (fetchError && fetchError.code !== "PGRST116") {
      console.error("Error checking if user exists:", fetchError);
      return NextResponse.json(
        { error: "Failed to check user record", details: fetchError.message, code: fetchError.code },
        { status: 500 }
      );
    }
    
    let result;
    
    try {
      if (existingUser) {
        // User exists - just update plan_selected
        console.log("Updating existing user plan selection:", { userId: user.id, plan, existingUser });
        result = await supabase
          .from("users")
          .update({ plan_selected: true })
          .eq("id", user.id)
          .select();
      } else {
        // User doesn't exist - create with all required fields
        // Get name from user_metadata if available
        const userName = (user.user_metadata?.name as string) || null;
        console.log("Creating new user record:", { userId: user.id, plan, name: userName });
        result = await supabase
          .from("users")
          .insert({
            id: user.id,
            email: user.email || "",
            name: userName,
            is_paid: false,
            free_searches_used: 0,
            plan_selected: true,
          })
          .select();
      }
    } catch (err) {
      console.error("Exception during database operation:", err);
      return NextResponse.json(
        { 
          error: "Database operation failed", 
          details: err instanceof Error ? err.message : "Unknown error",
          type: err instanceof Error ? err.constructor.name : typeof err
        },
        { status: 500 }
      );
    }

    const { error, data } = result;
    
    // Check for column-related errors (most common issue)
    const isColumnError = error && (
      error.message?.includes("column") && error.message?.includes("does not exist") ||
      error.message?.includes("plan_selected") ||
      error.code === "42703" // PostgreSQL undefined column error code
    );
    
    if (isColumnError) {
      console.warn("plan_selected column doesn't exist in database. Attempting fallback update...");
      console.warn("To fix permanently, run: ALTER TABLE users ADD COLUMN plan_selected BOOLEAN DEFAULT FALSE;");
      
      // Try a simpler update/insert without plan_selected
      let fallbackResult;
      if (existingUser) {
        // Just update without plan_selected - user record exists
        fallbackResult = await supabase
          .from("users")
          .update({})
          .eq("id", user.id);
      } else {
        // Insert without plan_selected
        const userName = (user.user_metadata?.name as string) || null;
        fallbackResult = await supabase
          .from("users")
          .insert({
            id: user.id,
            email: user.email || "",
            name: userName,
            is_paid: false,
            free_searches_used: 0,
          });
      }

      if (fallbackResult.error) {
        console.error("Fallback update/insert also failed:", fallbackResult.error);
        return NextResponse.json(
          { 
            error: "Database schema issue", 
            details: "The plan_selected column is missing. Please add it to your database.",
            sql: "ALTER TABLE users ADD COLUMN plan_selected BOOLEAN DEFAULT FALSE;",
            originalError: error.message
          },
          { status: 500 }
        );
      }

      // Return success but warn that plan_selected wasn't saved
      console.log("User record saved without plan_selected (column missing)");
      return NextResponse.json({ 
        success: true, 
        warning: "Database column missing - plan_selected not saved. Please add the column to persist plan selection." 
      });
    }

    if (error) {
      console.error("Error saving user plan:", {
        error,
        userId: user.id,
        plan,
        existingUser: !!existingUser,
        errorCode: error.code,
        errorMessage: error.message,
        errorDetails: error.details,
        errorHint: error.hint,
        fullError: JSON.stringify(error, null, 2),
      });
      return NextResponse.json(
        { 
          error: "Failed to save plan selection", 
          details: error.message || "Unknown database error",
          code: error.code,
          hint: error.hint
        },
        { status: 500 }
      );
    }

    console.log("Plan selection saved successfully:", { userId: user.id, plan, data });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Plan selection error (catch block):", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error("Error stack:", errorStack);
    return NextResponse.json(
      { 
        error: "Internal server error",
        details: errorMessage,
        type: error instanceof Error ? error.constructor.name : typeof error
      },
      { status: 500 }
    );
  }
}
