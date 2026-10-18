import { createClient } from './server'

export type SupabaseConnectionTestResult =
  | { success: true; user: { id: string; email: string | null } | null }
  | { success: false; error: string }

/**
 * Server-side test helper for verifying the Supabase connection.
 *
 * Retrieves the current user session. Use this in Route Handlers or server
 * actions to verify that the Supabase client works correctly.
 *
 * @example
 * ```ts
 * const result = await testSupabaseConnection()
 * if (result.success) {
 *   console.log('User:', result.user)
 * } else {
 *   console.error('Supabase error:', result.error)
 * }
 * ```
 */
export async function testSupabaseConnection(): Promise<SupabaseConnectionTestResult> {
  try {
    const supabase = await createClient()

    const { data: { user }, error } = await supabase.auth.getUser()

    if (error) {
      return {
        success: false,
        error: error.message,
      }
    }

    return {
      success: true,
      user: user ? { id: user.id, email: user.email ?? null } : null,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
