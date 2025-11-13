import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { AIMessage, BaseMessage, HumanMessage } from "@langchain/core/messages";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { StateGraph } from "@langchain/langgraph";
import { Annotation } from "@langchain/langgraph";
import { tool } from "@langchain/core/tools";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import { MongoDBAtlasVectorSearch } from "@langchain/mongodb";
import { MongoClient } from "mongodb";
import { z } from "zod";
import "dotenv/config";

function addProductUrl(item: any): any {
  const itemId = item._id?.toString() || item.id?.toString();
  if (itemId) {
    return {
      ...item,
      product_url: `/detail/${itemId}`
    };
  }
  return item;
}

async function translateToEnglish(query: string): Promise<string> {
  try {
    const translationModel = new ChatGoogleGenerativeAI({
      model: "gemini-2.5-flash",
      temperature: 0,
      apiKey: process.env.GOOGLE_API_KEY,
    });

    const translationPrompt = `Translate this furniture search query to English. Only return the English translation, nothing else:

    Query: "${query}"

    English:`;

    const result = await translationModel.invoke(translationPrompt);
    return result.content.toString().trim();
  } catch (error) {
    console.log("Translation failed, using original query:", error);
    return query;
  }
}

function isEnglish(text: string): boolean {
  const vietnameseChars =
    /[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;
  const commonVietnameseWords = [
    "và",
    "của",
    "có",
    "là",
    "với",
    "trong",
    "cho",
    "như",
    "được",
    "giường",
    "bàn",
    "ghế",
    "tủ",
  ];

  if (vietnameseChars.test(text)) return false;

  const words = text.toLowerCase().split(" ");
  return !words.some((word) => commonVietnameseWords.includes(word));
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      if (error.status === 429 && attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
        console.log(`Rate limit hit. Retrying in ${delay / 1000} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw new Error("Max retries exceeded");
}

export async function callAgent(
  client: MongoClient,
  query: string,
  thread_id: string,
) {
  try {
    const dbName = "inv_db";
    const db = client.db(dbName);
    const collection = db.collection("items");

    const GraphState = Annotation.Root({
      messages: Annotation<BaseMessage[]>({
        reducer: (x, y) => x.concat(y),
      }),
    });

    const itemLookupTool = tool(
      async ({ query, n = 10 }) => {
        try {
          console.log("Item lookup tool called with query:", query);

          const totalCount = await collection.countDocuments();
          console.log(`Total documents in collection: ${totalCount}`);

          if (totalCount === 0) {
            console.log("Collection is empty");
            return JSON.stringify({
              error: "No items found in inventory",
              message: "The inventory database appears to be empty",
              count: 0,
            });
          }

          const originalQuery = query;
          const isQueryInEnglish = isEnglish(query);
          let searchQuery = query;

          if (!isQueryInEnglish) {
            console.log(`Non-English query detected: "${query}"`);
            searchQuery = await translateToEnglish(query);
            console.log(`Translated to English: "${searchQuery}"`);
          }

          const dbConfig = {
            collection: collection,
            indexName: "vector_index",
            textKey: "embedding_text",
            embeddingKey: "embedding",
          };

          const vectorStore = new MongoDBAtlasVectorSearch(
            new GoogleGenerativeAIEmbeddings({
              apiKey: process.env.GOOGLE_API_KEY,
              model: "text-embedding-004",
            }),
            dbConfig,
          );

          console.log(`Performing vector search with: "${searchQuery}"`);
          const result = await vectorStore.similaritySearchWithScore(
            searchQuery,
            n,
          );
          console.log(`Vector search returned ${result.length} results`);

          if (result.length === 0) {
            console.log(
              "Vector search returned no results, trying text search...",
            );

            const searchTerms = [searchQuery];
            if (!isQueryInEnglish && searchQuery !== originalQuery) {
              searchTerms.push(originalQuery);
            }

            const textSearchConditions = [];
            for (const term of searchTerms) {
              const words = term.split(" ").filter((word) => word.length > 2);
              for (const word of words) {
                textSearchConditions.push(
                  { item_name: { $regex: word, $options: "i" } },
                  { item_description: { $regex: word, $options: "i" } },
                  { categories: { $regex: word, $options: "i" } },
                  { embedding_text: { $regex: word, $options: "i" } },
                );
              }
            }

            const textResults = await collection
              .find({
                $or: textSearchConditions,
              })
              .limit(n)
              .toArray();

            const textResultsWithUrl = textResults.map(addProductUrl);

            console.log(`Text search returned ${textResults.length} results`);
            return JSON.stringify({
              results: textResultsWithUrl,
              searchType: "text",
              originalQuery: originalQuery,
              translatedQuery: !isQueryInEnglish ? searchQuery : null,
              wasTranslated: !isQueryInEnglish,
              count: textResults.length,
            });
          }

          const resultsWithUrl = result.map(([doc, score]) => {
            const itemWithUrl = addProductUrl(doc.metadata);
            return [{ ...doc, metadata: itemWithUrl }, score];
          });

          return JSON.stringify({
            results: resultsWithUrl,
            searchType: "vector",
            originalQuery: originalQuery,
            translatedQuery: !isQueryInEnglish ? searchQuery : null,
            wasTranslated: !isQueryInEnglish,
            count: result.length,
          });
        } catch (error: any) {
          console.error("Error in item lookup:", error);
          return JSON.stringify({
            error: "Failed to search inventory",
            details: error.message,
            query: query,
          });
        }
      },
      {
        name: "item_lookup",
        description:
          "Searches furniture inventory with automatic language detection and translation. Supports any language - automatically translates non-English queries to English for database search.",
        schema: z.object({
          query: z.string().describe("The search query in any language"),
          n: z
            .number()
            .optional()
            .default(5)
            .describe("Number of results to return"),
        }),
      },
    );

    const tools = [itemLookupTool];
    const toolNode = new ToolNode<typeof GraphState.State>(tools);

    const model = new ChatGoogleGenerativeAI({
      model: "gemini-2.5-flash",
      temperature: 0.2,
      maxRetries: 0,
      apiKey: process.env.GOOGLE_API_KEY,
    }).bindTools(tools);

    function shouldContinue(state: typeof GraphState.State) {
      const messages = state.messages;
      const lastMessage = messages[messages.length - 1] as AIMessage;

      if (lastMessage.tool_calls?.length) {
        return "tools";
      }
      return "__end__";
    }

    async function callModel(state: typeof GraphState.State) {
      return retryWithBackoff(async () => {
        const prompt = ChatPromptTemplate.fromMessages([
          [
            "system",
            `You are a helpful E-commerce Chatbot Agent for a furniture store.

            RESPONSE FORMATTING RULES:
            - Format responses in clean, readable, summarized paragraphs
            - Include product details in this EXACT format:
              [**Product Name - Price USD**](product_url) 🪑

              (localized label for "Description"): (product description)
            - Use emojis appropriately (🪑 for chairs, 🛏️ for beds, etc.)
            - Keep responses conversational and friendly
            - Always add two line breaks (\\n\\n) between products
            - Always add one line break (\\n) after product name hyperlink before description

            MULTILINGUAL RESPONSE POLICY:
            - You can communicate in ANY language the customer uses
            - Always reply in the SAME language the user is currently using
            - If the user switches languages mid-conversation, immediately switch all future responses to that new language
            - Maintain consistency: the entire reply must be in one language only (no mixing)
            - The item_lookup tool automatically translates queries into English for database search, but your responses must always be in the user's active language

            IMPORTANT MULTILINGUAL CAPABILITIES:
            - Your item_lookup tool now has AUTOMATIC TRANSLATION:
              * Detects the language of user queries
              * Automatically translates non-English queries to English for database search
              * Searches the English database effectively
              * You should respond in the SAME language the customer used

            RESPONSE GUIDELINES:
            - When presenting search results, respond fully in the user's current language
            - If a user searches in Vietnamese (e.g., "giường"), the search is translated to English ("bed"), but your response must be in Vietnamese
            - Always use the item_lookup tool for furniture-related queries
            - Keep tone friendly, conversational, and natural in each language
            - If no results found, offer suggestions in the customer's language

            The database contains English product information, but the tool handles translation automatically.

            Current time: {time}`,
          ],
          new MessagesPlaceholder("messages"),
        ]);

        const formattedPrompt = await prompt.formatMessages({
          time: new Date().toISOString(),
          messages: state.messages,
        });

        const result = await model.invoke(formattedPrompt);
        return { messages: [result] };
      });
    }

    const workflow = new StateGraph(GraphState)
      .addNode("agent", callModel)
      .addNode("tools", toolNode)
      .addEdge("__start__", "agent")
      .addConditionalEdges("agent", shouldContinue)
      .addEdge("tools", "agent");

    const checkpointer = new MongoDBSaver({ client, dbName });
    const app = workflow.compile({ checkpointer });
    const finalState = await app.invoke(
      {
        messages: [new HumanMessage(query)],
      },
      {
        recursionLimit: 15,
        configurable: { thread_id: thread_id },
      },
    );

    const response =
      finalState.messages[finalState.messages.length - 1].content;
    console.log("Agent response:", response);

    return response;
  } catch (error: any) {
    console.error("Error in callAgent:", error.message);

    if (error.status === 429) {
      throw new Error(
        "Service temporarily unavailable due to rate limits. Please try again in a minute.",
      );
    } else if (error.status === 401) {
      throw new Error(
        "Authentication failed. Please check your API configuration.",
      );
    } else {
      throw new Error(`Agent failed: ${error.message}`);
    }
  }
}
