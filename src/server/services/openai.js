
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function categorizeTransaction(description, amount) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{
        role: "system",
        content: "You are a financial transaction categorizer. Respond with a single category name."
      }, {
        role: "user",
        content: `Categorize this transaction: "${description}" for $${amount}`
      }],
      temperature: 0.3,
      max_tokens: 20
    });
    
    return completion.choices[0].message.content.trim();
  } catch (error) {
    console.error('OpenAI API Error:', error);
    return null;
  }
}

module.exports = {
  categorizeTransaction
};
