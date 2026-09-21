const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const dotenv = require('dotenv');

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const products = [
  {
    name: '⭐ VIP',
    price: 5.90,
    command: 'vip {username} vip',
    category: 'Ranks',
    description: 'Torne-se VIP e tenha acesso a benefícios exclusivos no servidor!',
    includes: '✅ Prefixo VIP\n✅ 5 Homes\n✅ Kit VIP\n✅ /nick\n✅ /back\n✅ /recipe\n✅ /feed\n✅ /disposal'
  },
  {
    name: '💎 VIP+',
    price: 9.90,
    command: 'vip {username} vip+',
    category: 'Ranks',
    description: 'Evolua para VIP+ e desbloqueie ainda mais benefícios!',
    includes: '✅ Prefixo VIP+\n✅ 10 Homes\n✅ Kit VIP+\n✅ /nick\n✅ /back\n✅ /recipe\n✅ /feed\n✅ /disposal\n✅ /craft\n✅ /near'
  },
  {
    name: '🔥 MVP',
    price: 14.90,
    command: 'vip {username} mvp',
    category: 'Ranks',
    description: 'Torne-se MVP e aproveite uma experiência ainda mais completa!',
    includes: '✅ Prefixo MVP\n✅ Homes Ilimitados\n✅ Kit MVP\n✅ /nick\n✅ /back\n✅ /recipe\n✅ /feed\n✅ /disposal\n✅ /craft\n✅ /near\n✅ /enderchest'
  },
  {
    name: '👑 MVP+',
    price: 20.90,
    command: 'vip {username} mvp+',
    category: 'Ranks',
    description: 'Alcance o MVP+ e tenha acesso ao nível máximo de benefícios!',
    includes: '✅ Prefixo MVP+\n✅ Homes Ilimitados\n✅ Kit MVP+\n✅ /nick\n✅ /back\n✅ /recipe\n✅ /feed\n✅ /disposal\n✅ /craft\n✅ /near\n✅ /enderchest\n✅ /ptime\n✅ /repair\n✅ /fly'
  },
  {
    name: '🧪 Item de Teste',
    price: 0.01,
    command: 'give {username} dirt 1',
    category: 'Teste',
    description: 'Produto de teste para verificar a entrega automática.',
    includes: '✅ 1 Terra'
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
