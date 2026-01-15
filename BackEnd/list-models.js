require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function listModels() {
  try {
    console.log('Listing available models...\n');
    
    // Try to list models
    const models = await genAI.listModels();
    
    console.log('Available models:');
    for (const model of models) {
      console.log(`- ${model.name}`);
      console.log(`  Supported methods: ${model.supportedGenerationMethods?.join(', ')}`);
      console.log('');
    }
  } catch (error) {
    console.error('Error listing models:', error.message);
    
    // Try common model names
    console.log('\nTrying common model names:');
    const testModels = [
      'gemini-pro',
      'gemini-1.5-pro',
      'gemini-1.5-flash',
      'gemini-1.5-flash-latest',
      'gemini-1.0-pro'
    ];
    
    for (const modelName of testModels) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent('Hello');
        console.log(`✓ ${modelName} - WORKS`);
      } catch (err) {
        console.log(`✗ ${modelName} - ${err.message.split('\n')[0]}`);
      }
    }
  }
}

listModels();
