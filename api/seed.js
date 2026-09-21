const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const dotenv = require('dotenv');

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const products = [
  // =========================
  // 💎 VIPs — 30 DIAS
  // =========================
  {
    name: '🟢 VIP',
    price: 5.90,
    command: 'lp user {username} parent addtemp vip 30d',
    category: 'Ranks',
    description: 'Torne-se VIP por 30 dias e tenha acesso a benefícios exclusivos no servidor!',
    includes: '✅ Prefixo VIP\n✅ 5 Homes\n✅ Kit VIP\n✅ /nick\n✅ /back\n✅ /recipe\n✅ /feed\n✅ /disposal'
  },
  {
    name: '💚 VIP+',
    price: 9.90,
    command: 'lp user {username} parent addtemp vip+ 30d',
    category: 'Ranks',
    description: 'Evolua para VIP+ por 30 dias e desbloqueie ainda mais benefícios!',
    includes: '✅ Prefixo VIP+\n✅ 10 Homes\n✅ Kit VIP+\n✅ /nick\n✅ /back\n✅ /recipe\n✅ /feed\n✅ /disposal\n✅ /craft\n✅ /near'
  },
  {
    name: '💜 MVP',
    price: 14.90,
    command: 'lp user {username} parent addtemp mvp 30d',
    category: 'Ranks',
    description: 'Torne-se MVP por 30 dias e aproveite uma experiência ainda mais completa!',
    includes: '✅ Prefixo MVP\n✅ Homes Ilimitados\n✅ Kit MVP\n✅ /nick\n✅ /back\n✅ /recipe\n✅ /feed\n✅ /disposal\n✅ /craft\n✅ /near\n✅ /enderchest'
  },
  {
    name: '💎 MVP+',
    price: 20.90,
    command: 'lp user {username} parent addtemp mvp+ 30d',
    category: 'Ranks',
    description: 'Alcance o MVP+ por 30 dias e tenha acesso ao nível máximo de benefícios!',
    includes: '✅ Prefixo MVP+\n✅ Homes Ilimitados\n✅ Kit MVP+\n✅ /nick\n✅ /back\n✅ /recipe\n✅ /feed\n✅ /disposal\n✅ /craft\n✅ /near\n✅ /enderchest\n✅ /ptime\n✅ /repair\n✅ /fly'
  },

  // =========================
  // 🪙 CASH
  // =========================
  {
    name: '🪙 50 Cash',
    price: 4.99,
    command: 'playerpoints:p give {username} 50',
    category: 'Cash',
    description: 'Receba 50 Cash para utilizar na loja e nos sistemas do servidor.',
    includes: '🪙 50 Cash'
  },
  {
    name: '💰 100 Cash',
    price: 9.99,
    command: 'playerpoints:p give {username} 100',
    category: 'Cash',
    description: 'Receba 100 Cash para utilizar na loja e nos sistemas do servidor.',
    includes: '💰 100 Cash'
  },
  {
    name: '💰 300 Cash',
    price: 29.99,
    command: 'playerpoints:p give {username} 300',
    category: 'Cash',
    description: 'Receba 300 Cash para utilizar na loja e nos sistemas do servidor.',
    includes: '💰 300 Cash'
  },
  {
    name: '🧰 500 Cash',
    price: 49.99,
    command: 'playerpoints:p give {username} 500',
    category: 'Cash',
    description: 'Receba 500 Cash para utilizar na loja e nos sistemas do servidor.',
    includes: '🧰 500 Cash'
  },
  {
    name: '👑 1.000 Cash',
    price: 99.99,
    command: 'playerpoints:p give {username} 1000',
    category: 'Cash',
    description: 'Receba 1.000 Cash para utilizar na loja e nos sistemas do servidor.',
    includes: '👑 1.000 Cash'
  }
];

async function seedProducts() {
  console.log('🔄 Iniciando sincronização dos produtos...');

  try {
    await pool.query('DELETE FROM products');

    console.log('🗑️ Produtos antigos removidos.');

    let added = 0;

    for (const product of products) {
      try {
        const id = uuidv4();

        await pool.query(
          `INSERT INTO products
            (id, name, price, command, category, description, includes)
           VALUES
            ($1, $2, $3, $4, $5, $6, $7)`,
          [
            id,
            product.name,
            product.price,
            product.command,
            product.category,
            product.description,
            product.includes
          ]
        );

        console.log(
          `✅ ${product.name} - R$ ${product.price.toFixed(2)}`
        );

        added++;
      } catch (error) {
        console.error(
          `❌ Erro ao adicionar ${product.name}:`,
          error.message
        );
      }
    }

    console.log(`🎉 Sincronização concluída! ${added} produtos adicionados.`);

  } catch (error) {
    console.error('❌ Erro na sincronização:', error);
  }
}

module.exports = seedProducts;
