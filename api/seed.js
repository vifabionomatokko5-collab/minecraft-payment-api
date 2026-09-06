const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const dotenv = require('dotenv');
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const products = [
  // ========== PRODUTOS DE TESTE (R$ 0,01) ==========
  { 
    name: '🧱 1 Terra (TESTE)', 
    price: 0.01, 
    command: 'give {username} dirt 1', 
    category: 'Teste',
    description: '🧪 Produto de teste - 1 terra por apenas R$ 0,01!',
    includes: '✅ 1 Terra'
  },
  { 
    name: '🧪 1 Diamante (TESTE)', 
    price: 0.01, 
    command: 'give {username} diamond 1', 
    category: 'Teste',
    description: '🧪 Produto de teste - 1 diamante por apenas R$ 0,01!',
    includes: '✅ 1 Diamante'
  },
  { 
    name: '🧪 Kit Iniciante (TESTE)', 
    price: 0.01, 
    command: 'kitiniciante {username}', 
    category: 'Teste',
    description: '🧪 Produto de teste - Kit Iniciante por apenas R$ 0,01!',
    includes: '✅ Kit Iniciante Completo'
  },
  { 
    name: '🔑 Chave Comum (TESTE)', 
    price: 0.01, 
    command: 'chavescomum {username} 1', 
    category: 'Teste',
    description: '🧪 Produto de teste - 1 Chave Comum por apenas R$ 0,01!',
    includes: '✅ 1 Chave Comum'
  },
  { 
    name: '🎁 Mega Pacote (TESTE)', 
    price: 0.01, 
    command: 'megapack {username}', 
    category: 'Teste',
    description: '🧪 Produto de teste - Mega Pacote de Chaves por apenas R$ 0,01!',
    includes: '✅ 10 Chaves Comuns\n✅ 5 Chaves Raras\n✅ 3 Chaves Épicas\n✅ 2 Chaves Superiores'
  },
  
  // ========== RANKS ==========
  { 
    name: '🗡️ Rank Knight', 
    price: 5.90, 
    command: 'vip {username} knight', 
    category: 'Ranks',
    description: 'Torne-se um Cavaleiro e tenha acesso a benefícios exclusivos no servidor!',
    includes: '✅ Prefixo KNIGHT\n✅ 5 Homes\n✅ Kit Knight\n✅ Comandos: /nick, /back, /recipe, /feed, /disposal'
  },
  { 
    name: '🏰 Rank Lord', 
    price: 9.90, 
    command: 'vip {username} lord', 
    category: 'Ranks',
    description: 'Ascenda ao título de Lord e desfrute de privilégios maiores!',
    includes: '✅ Prefixo LORD\n✅ 10 Homes\n✅ Kit Lord\n✅ Comandos: /nick, /back, /recipe, /feed, /disposal, /craft, /near'
  },
  { 
    name: '⚔️ Rank Paladin', 
    price: 14.90, 
    command: 'vip {username} paladin', 
    category: 'Ranks',
    description: 'Torne-se um Paladino e proteja o reino com estilo!',
    includes: '✅ Prefixo PALADIN\n✅ Homes Ilimitados\n✅ Kit Paladin\n✅ Comandos: /nick, /back, /recipe, /feed, /disposal, /craft, /near, /enderchest'
  },
  { 
    name: '👑 Rank Duke', 
    price: 20.90, 
    command: 'vip {username} duke', 
    category: 'Ranks',
    description: 'Conquiste o título de Duque e governe com poder!',
    includes: '✅ Prefixo DUKE\n✅ Homes Ilimitados\n✅ Kit Duke\n✅ Comandos: /nick, /back, /recipe, /feed, /disposal, /craft, /near, /enderchest, /ptime'
  },
  { 
    name: '👑⭐ Rank King', 
    price: 30.90, 
    command: 'vip {username} king', 
    category: 'Ranks',
    description: '👑 TORNÊ-SE O REI! O rank máximo do servidor!',
    includes: '✅ Prefixo KING\n✅ Homes Ilimitados\n✅ Kit King\n✅ Todos os comandos: /nick, /back, /recipe, /feed, /disposal, /craft, /near, /enderchest, /ptime, /repair, /fly'
  },
  
  // ========== RECURSOS ==========
  { 
    name: '💎 64 Diamantes', 
    price: 4.50, 
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
    price: 2.00, 
    command: 'give {username} emerald 64', 
    category: 'Recursos',
    description: '64 esmeraldas valiosas para suas trocas!',
    includes: '✅ 64 Esmeraldas'
  },
  { 
    name: '🔴 64 Redstone', 
    price: 1.00, 
    command: 'give {username} redstone 64', 
    category: 'Recursos',
    description: '64 redstone para seus projetos de engenharia!',
    includes: '✅ 64 Redstone'
  },
  { 
    name: '⚫ 32 Obsidian', 
    price: 1.00, 
    command: 'give {username} obsidian 32', 
    category: 'Recursos',
    description: '32 obsidian para seus portais e construções!',
    includes: '✅ 32 Obsidian'
  },
  { 
    name: '💎 Bloco de Diamante', 
    price: 0.50, 
    command: 'give {username} diamond_block 1', 
    category: 'Recursos',
    description: 'Um bloco de diamante puro! Luxo e poder!',
    includes: '✅ 1 Bloco de Diamante'
  },
  { 
    name: '🪙 Bloco de Ouro', 
    price: 0.40, 
    command: 'give {username} gold_block 1', 
    category: 'Recursos',
    description: 'Um bloco de ouro para mostrar sua riqueza!',
    includes: '✅ 1 Bloco de Ouro'
  },
  
  // ========== EQUIPAMENTOS ==========
  { 
    name: '⚔️ Espada Diamante', 
    price: 2.00, 
    command: 'give {username} diamond_sword 1', 
    category: 'Equipamentos',
    description: 'A espada mais poderosa do jogo!',
    includes: '✅ 1 Espada de Diamante'
  },
  { 
    name: '🪓 Machado Diamante', 
    price: 2.00, 
    command: 'give {username} diamond_axe 1', 
    category: 'Equipamentos',
    description: 'Corte árvores com velocidade e precisão!',
    includes: '✅ 1 Machado de Diamante'
  },
  { 
    name: '⛏️ Picareta Diamante', 
    price: 2.00, 
    command: 'give {username} diamond_pickaxe 1', 
    category: 'Equipamentos',
    description: 'Mineire como um profissional com esta picareta!',
    includes: '✅ 1 Picareta de Diamante'
  },
  { 
    name: '🏹 Arco', 
    price: 1.00, 
    command: 'give {username} bow 1', 
    category: 'Equipamentos',
    description: 'Atire flechas com precisão e estilo!',
    includes: '✅ 1 Arco'
  },
  { 
    name: '🛡️ Escudo', 
    price: 1.00, 
    command: 'give {username} shield 1', 
    category: 'Equipamentos',
    description: 'Proteja-se dos ataques inimigos!',
    includes: '✅ 1 Escudo'
  },
  { 
    name: '💨 Elytra', 
    price: 2.50, 
    command: 'give {username} elytra 1', 
    category: 'Equipamentos',
    description: 'Voe pelos céus do servidor com estilo!',
    includes: '✅ 1 Elytra'
  },
  { 
    name: '⚔️ Espada Netherite', 
    price: 3.90, 
    command: 'give {username} netherite_sword 1', 
    category: 'Equipamentos',
    description: 'A espada mais poderosa do Nether!',
    includes: '✅ 1 Espada de Netherite'
  },
  
  // ========== KITS ==========
  { 
    name: '📦 Kit Iniciante', 
    price: 1.50, 
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
    price: 3.90, 
    command: 'kitconstrutor {username}', 
    category: 'Kits',
    description: 'Para os construtores de plantão!',
    includes: '✅ Picareta de Diamante\n✅ Machado de Diamante\n✅ Pá de Diamante\n✅ 32 Obsidian\n✅ 64 Pedra'
  },
  { 
    name: '📦 Kit Minerador', 
    price: 3.90, 
    command: 'kitminerador {username}', 
    category: 'Kits',
    description: 'Tudo que você precisa para minerar como um profissional!',
    includes: '✅ Picareta de Diamante\n✅ Picareta de Ferro\n✅ 32 Diamantes\n✅ 64 Carvão'
  },
  { 
    name: '📦 Kit Pescador', 
    price: 1.50, 
    command: 'kitpescador {username}', 
    category: 'Kits',
    description: 'Tudo que você precisa para pescar no servidor!',
    includes: '✅ Vara de Pescar\n✅ 32 Iscas\n✅ Balde de Água'
  },
  
  // ========== PACOTES ==========
  { 
    name: '🎁 Pack Diamante', 
    price: 12.00, 
    command: 'packdiamante {username}', 
    category: 'Pacotes',
    description: 'O pacote mais brilhante do servidor!',
    includes: '✅ 64 Diamantes\n✅ 2 Blocos de Diamante\n✅ 1 Picareta de Diamante\n✅ 1 Espada de Diamante'
  },
  { 
    name: '🎁 Pack Construtor', 
    price: 5.00, 
    command: 'packconstrutor {username}', 
    category: 'Pacotes',
    description: 'O pacote definitivo para construtores!',
    includes: '✅ 1 Picareta de Diamante\n✅ 1 Machado de Diamante\n✅ 1 Pá de Diamante\n✅ 64 Obsidian\n✅ 128 Pedra'
  },
  { 
    name: '🎁 Pack PvP', 
    price: 10.00, 
    command: 'packpvp {username}', 
    category: 'Pacotes',
    description: 'Domine o PvP com este pacote completo!',
    includes: '✅ 1 Espada de Diamante\n✅ Capacete de Diamante\n✅ Peitoral de Diamante\n✅ Calça de Diamante\n✅ Bota de Diamante\n✅ 16 Maçãs Douradas\n✅ 1 Escudo'
  },
  { 
    name: '🎁 Pack Overworld', 
    price: 15.00, 
    command: 'packoverworld {username}', 
    category: 'Pacotes',
    description: 'O pacote mais completo do Overworld!',
    includes: '✅ 64 Diamantes\n✅ 64 Ouros\n✅ 64 Esmeraldas\n✅ 1 Espada de Diamante\n✅ 1 Picareta de Diamante'
  },
  { 
    name: '🎁 Pack Nether', 
    price: 20.00, 
    command: 'packnether {username}', 
    category: 'Pacotes',
    description: 'Tudo que você precisa para explorar o Nether!',
    includes: '✅ 32 Netherite Ingot\n✅ 1 Espada de Netherite\n✅ 1 Picareta de Netherite\n✅ 32 Obsidian\n✅ 32 Fogo de Alma'
  },
  
  // ========== CHAVES ==========
  { 
    name: '🔑 Chave Comum', 
    price: 0.50, 
    command: 'chavescomum {username} 1', 
    category: 'Chaves',
    description: 'Abra crates comuns e ganhe recompensas básicas!',
    includes: '✅ 1 Chave Comum'
  },
  { 
    name: '🔑 Chave Rara', 
    price: 1.50, 
    command: 'chavesrara {username} 1', 
    category: 'Chaves',
    description: 'Abra crates raros com recompensas melhores!',
    includes: '✅ 1 Chave Rara'
  },
  { 
    name: '🔑 Chave Épica', 
    price: 3.50, 
    command: 'chavesepica {username} 1', 
    category: 'Chaves',
    description: 'Abra crates épicos e ganhe itens lendários!',
    includes: '✅ 1 Chave Épica'
  },
  { 
    name: '🔑 Chave Superior', 
    price: 5.00, 
    command: 'chavessuperior {username} 1', 
    category: 'Chaves',
    description: 'O melhor das chaves! Recompensas supremas!',
    includes: '✅ 1 Chave Superior'
  },
  
  // ========== PACOTES DE CHAVES ==========
  { 
    name: '📦 Pacote Comum 5x', 
    price: 4.00, 
    command: 'chavescomum {username} 5', 
    category: 'Chaves',
    description: '5 chaves comuns para você abrir vários crates!',
    includes: '✅ 5 Chaves Comuns'
  },
  { 
    name: '📦 Pacote Raro 3x', 
    price: 7.00, 
    command: 'chavesrara {username} 3', 
    category: 'Chaves',
    description: '3 chaves raras para aumentar suas chances!',
    includes: '✅ 3 Chaves Raras'
  },
  { 
    name: '📦 Pacote Épico 2x', 
    price: 7.50, 
    command: 'chavesepica {username} 2', 
    category: 'Chaves',
    description: '2 chaves épicas para recompensas lendárias!',
    includes: '✅ 2 Chaves Épicas'
  },
  { 
    name: '🎁 Mega Pacote de Chaves', 
    price: 20.00, 
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
