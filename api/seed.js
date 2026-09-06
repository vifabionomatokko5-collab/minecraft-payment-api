const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const dotenv = require('dotenv');
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const products = [
  // ========== RANKS ==========
  { 
    name: '🗡️ Rank Knight', 
    price: 9.90, 
    command: 'vip {username} knight', 
    category: 'Ranks',
    description: 'Torne-se um Cavaleiro e tenha acesso a benefícios exclusivos no servidor!',
    includes: '✅ Prefixo KNIGHT\n✅ 5 Homes\n✅ Kit Knight\n✅ Comandos: /nick, /back, /recipe, /feed, /disposal'
  },
  { 
    name: '🏰 Rank Lord', 
    price: 14.90, 
    command: 'vip {username} lord', 
    category: 'Ranks',
    description: 'Ascenda ao título de Lord e desfrute de privilégios maiores!',
    includes: '✅ Prefixo LORD\n✅ 10 Homes\n✅ Kit Lord\n✅ Comandos: /nick, /back, /recipe, /feed, /disposal, /craft, /near'
  },
  { 
    name: '⚔️ Rank Paladin', 
    price: 19.90, 
    command: 'vip {username} paladin', 
    category: 'Ranks',
    description: 'Torne-se um Paladino e proteja o reino com estilo!',
    includes: '✅ Prefixo PALADIN\n✅ Homes Ilimitados\n✅ Kit Paladin\n✅ Comandos: /nick, /back, /recipe, /feed, /disposal, /craft, /near, /enderchest'
  },
  { 
    name: '👑 Rank Duke', 
    price: 29.90, 
    command: 'vip {username} duke', 
    category: 'Ranks',
    description: 'Conquiste o título de Duque e governe com poder!',
    includes: '✅ Prefixo DUKE\n✅ Homes Ilimitados\n✅ Kit Duke\n✅ Comandos: /nick, /back, /recipe, /feed, /disposal, /craft, /near, /enderchest, /ptime'
  },
  { 
    name: '👑⭐ Rank King', 
    price: 39.90, 
    command: 'vip {username} king', 
    category: 'Ranks',
    description: '👑 TORNÊ-SE O REI! O rank máximo do servidor!',
    includes: '✅ Prefixo KING\n✅ Homes Ilimitados\n✅ Kit King\n✅ Todos os comandos: /nick, /back, /recipe, /feed, /disposal, /craft, /near, /enderchest, /ptime, /repair, /fly'
  },
  
  // ========== RECURSOS ==========
  { 
    name: '💎 64 Diamantes', 
    price: 5.00, 
    command: 'give {username} diamond 64', 
    category: 'Recursos',
    description: '64 diamantes para você usar como quiser!',
    includes: '✅ 64 Diamantes'
  },
  { 
    name: '🪙 64 Ouros', 
    price: 3.00, 
    command: 'give {username} gold_ingot 64', 
    category: 'Recursos',
    description: '64 barras de ouro para enriquecer!',
    includes: '✅ 64 Ouros'
  },
  { 
    name: '🟢 64 Esmeraldas', 
    price: 4.00, 
    command: 'give {username} emerald 64', 
    category: 'Recursos',
    description: '64 esmeraldas valiosas para suas trocas!',
    includes: '✅ 64 Esmeraldas'
  },
  
  // ========== KITS ==========
  { 
    name: '📦 Kit Iniciante', 
    price: 2.00, 
    command: 'kitiniciante {username}', 
    category: 'Kits',
    description: 'Perfeito para quem está começando! Tenha um ótimo início no servidor!',
    includes: '✅ Espada de Ferro\n✅ Capacete de Ferro\n✅ Peitoral de Ferro\n✅ Calça de Ferro\n✅ Bota de Ferro'
  },
  { 
    name: '📦 Kit Guerreiro', 
    price: 8.00, 
    command: 'kitguerreiro {username}', 
    category: 'Kits',
    description: 'Para os guerreiros que não temem batalhas!',
    includes: '✅ Espada de Diamante\n✅ Capacete de Diamante\n✅ Peitoral de Diamante\n✅ Calça de Diamante\n✅ Bota de Diamante'
  },
  { 
    name: '📦 Kit Construtor', 
    price: 6.00, 
    command: 'kitconstrutor {username}', 
    category: 'Kits',
    description: 'Para os construtores de plantão!',
    includes: '✅ Picareta de Diamante\n✅ Machado de Diamante\n✅ Pá de Diamante\n✅ 32 Obsidian\n✅ 64 Pedra'
  },
  
  // ========== CHAVES ==========
  { 
    name: '🔑 Chave Comum', 
    price: 1.50, 
    command: 'chavescomum {username} 1', 
    category: 'Chaves',
    description: 'Abra crates comuns e ganhe recompensas!',
    includes: '✅ 1 Chave Comum'
  },
  { 
    name: '🔑 Chave Rara', 
    price: 3.50, 
    command: 'chavesrara {username} 1', 
    category: 'Chaves',
    description: 'Abra crates raros com recompensas melhores!',
    includes: '✅ 1 Chave Rara'
  },
  { 
    name: '🔑 Chave Épica', 
    price: 5.50, 
    command: 'chavesepica {username} 1', 
    category: 'Chaves',
    description: 'Abra crates épicos e ganhe itens lendários!',
    includes: '✅ 1 Chave Épica'
  },
  { 
    name: '🔑 Chave Superior', 
    price: 7.00, 
    command: 'chavessuperior {username} 1', 
    category: 'Chaves',
    description: 'O melhor das chaves! Recompensas supremas!',
    includes: '✅ 1 Chave Superior'
  },
  
  // ========== PACOTES DE CHAVES ==========
  { 
    name: '📦 Pacote Comum 5x', 
    price: 6.00, 
    command: 'chavescomum {username} 5', 
    category: 'Chaves',
    description: '5 chaves comuns para você abrir vários crates!',
    includes: '✅ 5 Chaves Comuns'
  },
  { 
    name: '📦 Pacote Raro 3x', 
    price: 9.00, 
    command: 'chavesrara {username} 3', 
    category: 'Chaves',
    description: '3 chaves raras para aumentar suas chances!',
    includes: '✅ 3 Chaves Raras'
  },
  { 
    name: '📦 Pacote Épico 2x', 
    price: 9.00, 
    command: 'chavesepica {username} 2', 
    category: 'Chaves',
    description: '2 chaves épicas para recompensas lendárias!',
    includes: '✅ 2 Chaves Épicas'
  },
  { 
    name: '🎁 Mega Pacote de Chaves', 
    price: 25.00, 
    command: 'megapack {username}', 
    category: 'Chaves',
    description: 'O pacote mais completo de chaves do servidor!',
    includes: '✅ 10 Chaves Comuns\n✅ 5 Chaves Raras\n✅ 3 Chaves Épicas\n✅ 2 Chaves Superiores'
  }
];

async function seedProducts() {
  console.log('🔄 Iniciando seed automático de produtos...');
  
  try {
    const checkResult = await pool.query('SELECT COUNT(*) FROM products');
    const count = parseInt(checkResult.rows[0].count);
    
    if (count > 0) {
      console.log(`📦 ${count} produtos já existentes. Seed ignorado.`);
      return;
    }
    
    console.log('📦 Banco vazio. Adicionando produtos...');
    
    let added = 0;
    
    for (const product of products) {
      try {
        const id = uuidv4();
        await pool.query(
          `INSERT INTO products (id, name, price, command, category, description, includes) 
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [id, product.name, product.price, product.command, product.category, product.description || null, product.includes || null]
        );
        console.log(`✅ ${product.name} - R$ ${product.price.toFixed(2)} (${product.category})`);
        added++;
      } catch (error) {
        console.error(`❌ Erro ao adicionar ${product.name}:`, error.message);
      }
    }
    
    console.log(`\n🎉 Seed automático finalizado! ${added} produtos adicionados.`);
  } catch (error) {
    console.error('❌ Erro no seed:', error);
  }
}

module.exports = seedProducts;
