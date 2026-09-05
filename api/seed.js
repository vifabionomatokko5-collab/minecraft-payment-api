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
  { name: '🗡️ Rank Knight', price: 9.90, command: 'lp user {username} parent add knight', category: 'Ranks' },
  { name: '🏰 Rank Lord', price: 14.90, command: 'lp user {username} parent add lord', category: 'Ranks' },
  { name: '⚔️ Rank Paladin', price: 19.90, command: 'lp user {username} parent add paladin', category: 'Ranks' },
  { name: '👑 Rank Duke', price: 29.90, command: 'lp user {username} parent add duke', category: 'Ranks' },
  { name: '👑⭐ Rank King', price: 39.90, command: 'lp user {username} parent add king', category: 'Ranks' },
  
  // ========== RECURSOS ==========
  { name: '💎 64 Diamantes', price: 5.00, command: 'give {username} diamond 64', category: 'Recursos' },
  { name: '🪙 64 Ouros', price: 3.00, command: 'give {username} gold_ingot 64', category: 'Recursos' },
  { name: '🟢 64 Esmeraldas', price: 4.00, command: 'give {username} emerald 64', category: 'Recursos' },
  { name: '🔴 64 Redstone', price: 2.00, command: 'give {username} redstone 64', category: 'Recursos' },
  { name: '⚫ 32 Obsidian', price: 3.00, command: 'give {username} obsidian 32', category: 'Recursos' },
  { name: '💎 Bloco de Diamante', price: 8.00, command: 'give {username} diamond_block 1', category: 'Recursos' },
  { name: '🪙 Bloco de Ouro', price: 5.00, command: 'give {username} gold_block 1', category: 'Recursos' },
  
  // ========== EQUIPAMENTOS ==========
  { name: '⚔️ Espada Diamante', price: 4.00, command: 'give {username} diamond_sword 1', category: 'Equipamentos' },
  { name: '🪓 Machado Diamante', price: 4.00, command: 'give {username} diamond_axe 1', category: 'Equipamentos' },
  { name: '⛏️ Picareta Diamante', price: 4.00, command: 'give {username} diamond_pickaxe 1', category: 'Equipamentos' },
  { name: '🏹 Arco', price: 3.00, command: 'give {username} bow 1', category: 'Equipamentos' },
  { name: '🛡️ Escudo', price: 2.00, command: 'give {username} shield 1', category: 'Equipamentos' },
  { name: '💨 Elytra', price: 10.00, command: 'give {username} elytra 1', category: 'Equipamentos' },
  
  // ========== KITS ==========
  { name: '📦 Kit Iniciante', price: 2.00, command: 'kitiniciante {username}', category: 'Kits' },
  { name: '📦 Kit Guerreiro', price: 8.00, command: 'kitguerreiro {username}', category: 'Kits' },
  { name: '📦 Kit Construtor', price: 6.00, command: 'kitconstrutor {username}', category: 'Kits' },
  
  // ========== PACOTES ==========
  { name: '🎁 Pack Diamante', price: 12.00, command: 'packdiamante {username}', category: 'Pacotes' },
  { name: '🎁 Pack Construtor', price: 10.00, command: 'packconstrutor {username}', category: 'Pacotes' },
  { name: '🎁 Pack PvP', price: 15.00, command: 'packpvp {username}', category: 'Pacotes' },
  
  // ========== CHAVES INDIVIDUAIS ==========
  { name: '🔑 Chave Comum', price: 1.50, command: 'chavescomum {username} 1', category: 'Chaves' },
  { name: '🔑 Chave Rara', price: 3.50, command: 'chavesrara {username} 1', category: 'Chaves' },
  { name: '🔑 Chave Épica', price: 5.50, command: 'chavesepica {username} 1', category: 'Chaves' },
  { name: '🔑 Chave Superior', price: 7.00, command: 'chavessuperior {username} 1', category: 'Chaves' },
  
  // ========== PACOTES DE CHAVES ==========
  { name: '📦 Pacote Comum 5x', price: 6.00, command: 'chavescomum {username} 5', category: 'Chaves' },
  { name: '📦 Pacote Raro 3x', price: 9.00, command: 'chavesrara {username} 3', category: 'Chaves' },
  { name: '📦 Pacote Épico 2x', price: 9.00, command: 'chavesepica {username} 2', category: 'Chaves' },
  { name: '📦 Pacote Superior 2x', price: 12.00, command: 'chavessuperior {username} 2', category: 'Chaves' },
  
  // ========== MEGA PACOTE ==========
  { name: '🎁 Mega Pacote de Chaves', price: 0.01, command: 'megapack {username}', category: 'Chaves' },
];

async function seedProducts() {
  console.log('🔄 Iniciando seed automático de produtos...');
  
  try {
    // Verificar se já existem produtos
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
          `INSERT INTO products (id, name, price, command, category) 
           VALUES ($1, $2, $3, $4, $5)`,
          [id, product.name, product.price, product.command, product.category]
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
