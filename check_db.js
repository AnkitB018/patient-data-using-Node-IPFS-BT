import pg from 'pg';
const { Client } = pg;

const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'Antrogres_1234',
    database: 'Medical_project'
});

async function checkDatabase() {
    try {
        await client.connect();
        console.log('✅ Successfully connected to "Medical_project" database!\n');
        
        // Get all tables
        console.log('📋 Tables in database:');
        const tablesResult = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name;
        `);
        
        if (tablesResult.rows.length === 0) {
            console.log('❌ No tables found in database!\n');
        } else {
            tablesResult.rows.forEach(row => {
                console.log(`  - ${row.table_name}`);
            });
            console.log('');
            
            // Get schema for each table
            for (const table of tablesResult.rows) {
                const tableName = table.table_name;
                console.log(`\n📊 Schema for "${tableName}" table:`);
                console.log('='.repeat(80));
                
                const schemaResult = await client.query(`
                    SELECT 
                        column_name,
                        data_type,
                        character_maximum_length,
                        is_nullable,
                        column_default
                    FROM information_schema.columns
                    WHERE table_name = $1
                    ORDER BY ordinal_position;
                `, [tableName]);
                
                schemaResult.rows.forEach(col => {
                    const type = col.character_maximum_length 
                        ? `${col.data_type}(${col.character_maximum_length})`
                        : col.data_type;
                    const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
                    const defaultVal = col.column_default ? `DEFAULT ${col.column_default}` : '';
                    
                    console.log(`  ${col.column_name.padEnd(30)} ${type.padEnd(20)} ${nullable.padEnd(10)} ${defaultVal}`);
                });
                
                // Get constraints (Primary Keys, Foreign Keys)
                const constraintsResult = await client.query(`
                    SELECT
                        tc.constraint_name,
                        tc.constraint_type,
                        kcu.column_name,
                        ccu.table_name AS foreign_table_name,
                        ccu.column_name AS foreign_column_name
                    FROM information_schema.table_constraints AS tc
                    JOIN information_schema.key_column_usage AS kcu
                        ON tc.constraint_name = kcu.constraint_name
                        AND tc.table_schema = kcu.table_schema
                    LEFT JOIN information_schema.constraint_column_usage AS ccu
                        ON ccu.constraint_name = tc.constraint_name
                        AND ccu.table_schema = tc.table_schema
                    WHERE tc.table_name = $1
                    ORDER BY tc.constraint_type, kcu.column_name;
                `, [tableName]);
                
                if (constraintsResult.rows.length > 0) {
                    console.log('\n  Constraints:');
                    constraintsResult.rows.forEach(cons => {
                        if (cons.constraint_type === 'PRIMARY KEY') {
                            console.log(`    🔑 PRIMARY KEY: ${cons.column_name}`);
                        } else if (cons.constraint_type === 'FOREIGN KEY') {
                            console.log(`    🔗 FOREIGN KEY: ${cons.column_name} → ${cons.foreign_table_name}(${cons.foreign_column_name})`);
                        } else if (cons.constraint_type === 'UNIQUE') {
                            console.log(`    ⭐ UNIQUE: ${cons.column_name}`);
                        }
                    });
                }
                
                // Get row count
                const countResult = await client.query(`SELECT COUNT(*) FROM ${tableName}`);
                console.log(`\n  📊 Row count: ${countResult.rows[0].count}`);
            }
        }
        
    } catch (error) {
        console.error('❌ Database connection error:', error.message);
    } finally {
        await client.end();
        console.log('\n\n✅ Database check complete!');
    }
}

checkDatabase();
