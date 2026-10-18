#!/usr/bin/env node
/**
 * K15.2 Schema Verification
 * Checks if migration 20261028 has been applied to the Supabase database
 */

const { createClient } = require('@supabase/supabase-js');

async function verifySchema() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ ERROR: Missing SUPABASE environment variables');
    console.error('   Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  console.log('\n========================================');
  console.log('K15.2 Schema Verification');
  console.log('========================================\n');

  try {
    // 1. Check members table columns
    console.log('1️⃣  Checking members table columns...');
    const { data: columns, error: columnsError } = await supabase.rpc('get_table_columns', {
      table_name: 'members'
    });

    if (columnsError) {
      console.log('   ⚠️  RPC not available, trying direct query...');
      
      // Fallback: Try direct select
      const { data: sample, error: selectError } = await supabase
        .from('members')
        .select('*')
        .limit(1);

      if (selectError) {
        console.error('   ❌ Cannot query members table:', selectError.message);
      } else {
        console.log('   ✅ members table exists');
        if (sample && sample.length > 0) {
          const member = sample[0];
          const hasNewColumns = {
            auth_user_id: 'auth_user_id' in member,
            member_number: 'member_number' in member,
            title: 'title' in member,
            birth_date: 'birth_date' in member,
            membership_type: 'membership_type' in member,
            left_at: 'left_at' in member,
            notes: 'notes' in member,
            photo_path: 'photo_path' in member,
            created_by: 'created_by' in member,
            updated_by: 'updated_by' in member,
          };

          const allPresent = Object.values(hasNewColumns).every(v => v);
          console.log('\n   Expected columns from 20261028:');
          Object.entries(hasNewColumns).forEach(([col, present]) => {
            console.log(`     ${present ? '✅' : '❌'} ${col}`);
          });

          if (allPresent) {
            console.log('\n   🟢 VERDICT: Migration 20261028 appears to be APPLIED');
          } else {
            console.log('\n   🔴 VERDICT: Migration 20261028 appears to be NOT APPLIED');
          }
        }
      }
    }

    // 2. Check member_guardians table
    console.log('\n2️⃣  Checking member_guardians table...');
    const { data: guardians, error: guardiansError } = await supabase
      .from('member_guardians')
      .select('*')
      .limit(1);

    if (guardiansError) {
      console.log('   ❌ member_guardians not accessible:', guardiansError.message);
    } else {
      console.log('   ✅ member_guardians table exists');
    }

    // 3. Check missing tables
    console.log('\n3️⃣  Checking for missing tables...');
    const missingTables = ['member_courses', 'member_driving_licenses', 'member_documents'];
    
    for (const tableName of missingTables) {
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .limit(1);

      if (error && error.code === 'PGRST116') {
        console.log(`   ❌ ${tableName} - NOT FOUND`);
      } else if (error) {
        console.log(`   ⚠️  ${tableName} - ERROR: ${error.message}`);
      } else {
        console.log(`   ✅ ${tableName} - EXISTS (${data.length} rows)`);
      }
    }

  } catch (err) {
    console.error('❌ Verification failed:', err.message);
    process.exit(1);
  }

  console.log('\n========================================');
  console.log('Verification complete');
  console.log('========================================\n');
}

verifySchema();
