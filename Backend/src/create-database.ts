import { Client } from 'pg';
import 'dotenv/config';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function createDatabase() {
  const adminUser = process.env.DB_USER;
  const adminPassword = process.env.DB_PASSWORD;
  const host = process.env.DB_HOST || 'localhost';
  const port = Number(process.env.DB_PORT) || 5432;
  const dbName = process.env.DB_NAME;
  const appUser = 'ThePhoenix';
  const appPassword = 'Password123!';

  if (!adminUser || !adminPassword || !dbName) {
    console.error('Faltan variables de entorno para la base de datos.');
    process.exit(1);
  }

  const dbFlagFile = path.join(__dirname, '../.db_initialized');
  const maxRetries = 5;

  // Si ya existe el flag, saltamos todo
  if (fs.existsSync(dbFlagFile)) {
    console.log('DB ya inicializada previamente. Saltando setup.');
    return;
  }

  const client = new Client({ user: adminUser, password: adminPassword, host, port });

  try {
    await client.connect();

    // 1. Crear DB si no existe con retry
    let createdDb = false;
    for (let i = 0; i < maxRetries; i++) {
      try {
        const dbRes = await client.query(`SELECT 1 FROM pg_database WHERE datname=$1`, [dbName]);
        createdDb = dbRes.rowCount === 0;
        if (createdDb) {
          await client.query(`CREATE DATABASE "${dbName}"`);
          console.log(`Base de datos "${dbName}" creada.`);
        } else {
          console.log(`Base de datos "${dbName}" ya existe.`);
        }
        break; // salió sin error
      } catch (err: any) {
        if (err.code === '23505' || err.code === 'XX000') {
          console.log(`Intento ${i + 1}: base de datos ya existe o en concurrencia, reintentando...`);
          await sleep(200);
        } else {
          throw err;
        }
      }
    }

    // 2. Crear usuario si no existe con retry
    for (let i = 0; i < maxRetries; i++) {
      try {
        const userRes = await client.query(`SELECT 1 FROM pg_roles WHERE rolname=$1`, [appUser]);
        if (userRes.rowCount === 0) {
          await client.query(`CREATE USER "${appUser}" WITH PASSWORD '${appPassword}'`);
          console.log(`Usuario "${appUser}" creado.`);
        } else {
          console.log(`Usuario "${appUser}" ya existe.`);
        }
        break;
      } catch (err: any) {
        if (err.code === '23505' || err.code === 'XX000') {
          console.log(`Intento ${i + 1}: usuario ya existe o en concurrencia, reintentando...`);
          await sleep(200);
        } else {
          throw err;
        }
      }
    }

    // 3. Dar permisos completos
    try {
      await client.query(`GRANT ALL PRIVILEGES ON DATABASE "${dbName}" TO "${appUser}"`);
      const dbClient = new Client({ user: adminUser, password: adminPassword, host, port, database: dbName });
      await dbClient.connect();
      await dbClient.query(`GRANT ALL PRIVILEGES ON SCHEMA public TO "${appUser}"`);
      await dbClient.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO "${appUser}"`);
      await dbClient.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO "${appUser}"`);
      await dbClient.query(`ALTER SCHEMA public OWNER TO "${appUser}"`);
      console.log(`Permisos otorgados a "${appUser}".`);
      await dbClient.end();
    } catch (err: any) {
      if (err.code === 'XX000') {
        console.warn('Advertencia: conflicto concurrente al asignar permisos. Continuando...');
      } else {
        throw err;
      }
    }
    
    // Crear el flag siempre
    if (!fs.existsSync(dbFlagFile)) {
      fs.writeFileSync(dbFlagFile, 'DB inicializada previamente.');
    }

    // 4. Revisar migraciones existentes
    const migrationsPath = path.join(__dirname, '../prisma/migrations');
    let hasMigrations = false;
    if (fs.existsSync(migrationsPath)) {
      const entries = fs.readdirSync(migrationsPath, { withFileTypes: true });
      hasMigrations = entries.some(e => e.isDirectory());
    }

    // 5. Primera migración o regenerar flag
    if (!hasMigrations && createdDb) {
      console.log('Ejecutando primera migración...');
      execSync('npx prisma migrate dev --name init', { stdio: 'inherit' });
      console.log('Primera migración aplicada. Puedes iniciar Nest ahora.');
      fs.writeFileSync(dbFlagFile, 'DB inicializada correctamente.');
    } else if (hasMigrations) {
      // Regenerar flag si no existe
      if (!fs.existsSync(dbFlagFile)) {
        try {
          console.log('Regenerando flag .db_initialized automáticamente...');
          fs.writeFileSync(dbFlagFile, 'DB inicializada previamente.');
        } catch (err) {
          console.error('Error creando flag .db_initialized:', err);
        }
      }

      console.log(
        'Migraciones existentes detectadas. Asegúrate de ejecutar las migraciones pendientes:\n' +
        '  npx prisma migrate dev\n' +
        'Luego ejecuta: npx prisma generate'
      );

      // ⚠️ No salir del proceso, solo advertencia
      // process.exit(1);
    }

  } catch (err) {
    console.error('Error en setup de base de datos:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Ejecutar antes de iniciar Nest
createDatabase();
