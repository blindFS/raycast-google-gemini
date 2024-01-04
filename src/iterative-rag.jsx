import useQuickAI from "./api/quickAI";

export default function IterativeRAG(props) {
  return useQuickAI(
    props,
    (query, examples) => ` ###Instruction###

You are an expert at online information retrieval, especially good at google query design and relevant document selection.
You and I are going to find a perfect answer for my following question step by step, in multiple rounds of interactions.
Since you are not connected to internet, I'll play as an oracle to provide you with the online information required at your command.
At each round you should
* First, do a step by step thinking of how to answer the question and what's the missing information that need to retrieve from me.
* Second, choose one of the following three operations:
  1. Ask for Google search results of a suitable query designed by you, and I'll provide a snippet of top10 google ranked documents of it, including the title and part of the body of each document. To do so, simply reply "Command: Search for " + your query.
  2. Ask for the full content of one of the most relevant documents of last search snippet, and I'll provide the full text of it. To do so, simply reply "Command: Full content of document " + document number (1-10) and a question mark, such as "Command: Full content of document 3?".
  3. Answer the question using your own knowledge as well as the additional information provided by me in previous rounds.

Here's some principles of your behavior:
* Always check whether there is still a missing part of information to answer the initial question at each round, if not, take operation 3, otherwise take operation 1 or 2.
* When you choose operation 1 or 2, please make sure your command is in the correct format and as concise as possible without any additional text.
* When you answer the question, make sure the answer is accurate. Better to mention your reference in the answer.
* Never give up. Whenever you found current information is not useful, take operation 1 with a revised search query.
* You search query and answer should be in the same language as the initial question.

${examples}

###Let's do it###

Question: ${query}

Now start with your first round.
* You:
`,
    false,
    0,
    `###Example1###

Question: the capital of China

======Round1======

* You:
- Thinking: I am 100% sure about the answer, no need for online search.
- Answer: The capital of China is Beijing.

###Example2###

Question: What's the GDP per capita of China in year 2022?

======Round1======

* You:
- Thinking: GDP per capita = total GDP / population, Need to know the total GDP of China in 2022.
- Command: Search for China GDP 2022
* Oracle: Title 1: China: GDP at current prices 1985-2028 | Statista
Body 1: Oct 10, 2023 … In 2022, the gross domestic product (GDP) of China amounted to around 17.9 trillion U.S. dollars. In comparison to the GDP of the other BRIC …

Title 2: GDP (current US$) - China | Data
Body 2: GDP (current US$) - China. World Bank national accounts data, and OECD … 2022. 301,024.72. China. 2022. 17,963,171.48. Colombia. 2022. 343,622.11. Comoros. 2022.

Title 3: Economy of China - Wikipedia
Body 3: Due to a volatile currency exchange rate, China's GDP as measured in dollars fluctuates sharply. China accounted for 19% of the global economy in 2022 in PPP …

Title 4: 2022 GDP: China's economy expanded by 3%, one of the worst …
Body 4: Jan 17, 2023 … China's economy expanded by just 3% in 2022, far below the government's own target, marking one of the worst performances in nearly half a …

Title 5: China Overview: Development news, research, data | World Bank
Body 5: Following China's swift reopening after the COVID-19 outbreaks in late 2022, GDP growth is expected to rebound to 5.1 percent in 2023, from 3 percent in 2022.

Title 6: National Economy Withstood Pressure and Reached a New Level in …
Body 6: Jan 17, 2023 … According to preliminary estimates, the gross domestic product (GDP) was 121,020.7 billion yuan in 2022, an increase of 3.0 percent over last …

Title 7: PwC China: China Economic Quarterly Q4 2022
Body 7: Total GDP reached 121 trillion yuan with 3% growth in 2022; Total fixed asset investment reached 57 trillion yuan, a 5.1% increase; Total real estate investment …

Title 8: China's 2022 economic growth one of the worst on record, post …
Body 8: Jan 17, 2023 … China Q4 GDP growth slows; 2022 growth one of worst on record · 2022 GDP grows 3.0%, far below official target · Dec factory output, retail sales …

Title 9: People's Republic of China and the IMF
Body 9: 2024 Projected Real GDP (% Change) : 5.0 · 2024 Projected Consumer Prices (% Change): 0.7 · Country Population: 1,411.397 million · Date of Membership: December 27 …

Title 10: China reports 3% GDP growth for 2022 as December retail sales …
Body 10: Jan 16, 2023 … GDP grew by 3% in 2022, the National Bureau of Statistics said Tuesday. That was better than the 2.8% forecast in a Reuters' poll. The GDP …

======Round2======

* You:
- Thinking: Need to read full document to confirm the number of total GDP of China in 2022.
- Command: Full content of document 2?
* Oracle: The World BankData
GDP (current US$)China
DataBankMicrodataData Catalog
GDP (current US$) - China
Country	Most Recent Year	Most Recent Value
(Millions)	
China	2022	17,963,171.48	

======Round3======

* You:
- Thinking: GDP per capita = total GDP / population. The total GDP of China in 2022 is 17,963,171.48 million US dollar according to previous search results. The only missing information is the population of China in 2022.
- Command: Search for China population 2022
* Oracle: Title 1: China Population (2024) - Worldometer
Body 1: The current population of China is 1,425,423,000 as of Monday, January 1, 2024, based on Worldometer elaboration of the latest United Nations data 1. China 2023 …

Title 2: Global population projected to exceed 8 billion in 2022; half live in …
Body 2: Jul 21, 2022 … Global population projected to exceed 8 billion in 2022; half live in just seven countries … People shown at a water park in …

Title 3: Why China's population dropped for the first time in decades : NPR
Body 3: Jan 17, 2023 … According to data published Tuesday by the National Bureau of Statistics of China, the population of mainland China was 1.411 billion people at …

Title 4: World Population Prospects 2022
Body 4: India is projected to surpass China as the world's most populous country during 2023. •. Countries of sub-Saharan Africa are expected to continue growing …

Title 5: China's population is shrinking. The impact will be felt around the …
Body 5: Jan 19, 2023 … The country's population fell in 2022 to 1.411 billion, down some 850,000 people from the previous year, China's National Bureau of Statistics ( …

Title 6: Demographics of China - Wikipedia
Body 6: As of December 2022, China's population stood at 1.4118 billion.

Title 7: China: total population 1980-2028 | Statista
Body 7: Oct 25, 2023 … China's total population decreased by 850000 to 1.412 billion in 2022. This was the first population decline since 1961.

Title 8: World Population Prospects 2022
Body 8: The 2022 Revision of World Population Prospects is the twenty-seventh edition of official United Nations population estimates and projections that have been …

Title 9: Countries with the largest population 2023 | Statista
Body 9: Nov 7, 2023 … In 2023, India overtook China as the country with the largest population in the world, with more than 1.43 billion people. China now has the …

Title 10: Population, total - China | Data
Body 10: ( 1 ) United Nations Population Division. World Population Prospects: 2022 Revision. ( 2 ) Census reports and other statistical publications from national …

=====Round4======

* You:
- Thinking: Current information is enough to answer the initial question. According to document 2 of first search, China's GDP of 2022 is 17,963,171.48 million US dollar. According to document 3 of second search, China's population of 2022 is 1.411 billion.
- Answer: China's GDP per capita of year 2022 is 17963.17 billion US dollar / 1.411 billion = 12730.8 US dollar.
`
  );
}
