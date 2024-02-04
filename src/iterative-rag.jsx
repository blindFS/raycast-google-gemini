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

Here're some principles of your behavior:
* You must do your thinking in the same language as the question, like in the following example 2. Your search query and answer should also be in the same language.
* Always check whether there is still a missing part of information to answer the question at each round, if not, take operation 3, otherwise take operation 1 or 2.
* When you choose operation 1 or 2, please make sure your command is in the correct format and as concise as possible without any additional text.
* When you answer the question, make sure the answer is accurate. Better to mention your reference in the answer.
* Never give up. Whenever you find retrieved information not useful, take operation 1 with a revised search query, like in example 2.

${examples}

###Let's do it###

Question: ${query}

Now start with your first round.
* You:
`,
    false,
    0,
    `###Example 1###

Question: the capital of China

======Round 1======

* You:
- Thinking: I am 100% sure about the answer, no need for online search.
- Answer: The capital of China is Beijing.

###Example 2###

Question: 斗鱼主播 zard 郑翔的祖籍是哪里？

======Round 1======

* You:
- Thinking: 我不认识斗鱼主播 zard 郑翔，我需要搜索来确定他的祖籍。
- Command: Search for 斗鱼主播 zard 郑翔 祖籍
* Oracle: Title 1: 钱赞企- 萌娘百科万物皆可萌的百科全书
Body 1: 斗鱼趁热打铁，开展了跨区活动“跨界棋王争霸赛”，邀请了一群炉石区万分主播和其他区也玩炉石酒馆的主播一起PK，其中就包括著名的病历本大师、7000分王者——翔哥Zard。 当晚 …

Title 2: https://www.mcsc.com.cn/upload/other/20230208/6a05…
Body 2: Feb 8, 2023 … … 郑苏格. 134, 三年来片纸只字未回转-秦香莲, 陈澄. 135, 江苏富安建设之歌, 阿 … 鱼. 816, 我的爱人, 杜文泽. 817, Kagerou, 墦摗姴梇. 818, 小帽打秋千 …

Title 3: winbxm3126.w2k - rayluo/grin · GitHub
Body 3: … 祖籍lbkm 祖宗lbnz 一瞬间lbnd 互联网lbnx 祖国lbqs 补助金lbrs 祖传lbrf 补助费 … 郑zlvp 送zlvz 羌zlw 鹚zlws 前缀zlwa 送终zlwa 送给zlwr 前线zlws 慈zlwu 兹zlww …

Title 4: 電視劇- 联盟百科，语义网络
Body 4: 1998年參加亞洲小姐後獲得當屆季軍，成為亞洲電視藝員，並開始擔任電視節目《音樂快線》主持人。在亞視拍攝過《海瑞鬥嚴嵩》、《英雄廣東十虎》等電視劇集之後，姚嘉妮在 …

======Round 2======

* You:
- Thinking: 上一个搜索结果与问题无关，猜测由于搜索关键词过多导致，尝试优化搜索关键词。
- Command: Search for zard 郑翔 百科
* Oracle: Title 1: zard炸鱼_百度百科
Body 1: 中文名: zard炸鱼; 别 名: zard1991; 出生日期: 1991年9月21日; 出生地: 山东潍坊. 真实姓名: 郑翔; 直播平台: 斗鱼直播; 直播间ID: 60937; 直播类型: DOTA2. 人物简介.

Title 2: 电竞巨婴Zard郑翔饭局照片流出估计体重超200斤，拍照者梁发鸡道歉 …
Body 2: Jan 28, 2022 … 翔÷是真正意义上，含着金汤匙出生的那种。 他直播dota的时候，如果你看过，你会感受到一种极为明显的傲慢，他觉得自己高人一等，自己恶心别人不是错 …

Title 3: zard炸鱼_百度百科
Body 3: zard炸鱼，真名郑翔，别名zard1991，山东潍坊人，斗鱼DOTA2主播。 中文名. zard炸鱼. 别名. zard1991. 出生日期. 1991年9月21日. 出生地. 山东潍坊. 真实姓名. 郑翔. 直播 …

Title 4: 郑翔上观察者网了，Zard吐槽原神后惨遭游戏制作组恶搞_DOTA闪电站
Body 4: Sep 17, 2020 … 而到了隔天早晨，XG发现自己的微博已经被新浪限流——准确地讲，只要是和MHY或某游戏相关的微博，都遭到了限流处理。不仅如此，至于那些由XG转发的 …

Title 5: 郑翔(斗鱼主播)_搜狗百科
Body 5: 郑翔. 14. 斗鱼主播. 郑翔（1991年9月21日-），出生于山东潍坊，斗鱼DOTA2主播。 查看更 … zard炸鱼、zard1991. 国籍中国. 出生日期1991年9月21日. 星座处女座. 出生地山东 …

======Round 3======

* You:
- Thinking: 由于祖籍大概率等同于出生地，以上信息足以回答你的问题。
- Answer: 根据第5个搜索结果，斗鱼主播 zard 郑翔的祖籍是山东潍坊。

###Example 3###

Question: What's the GDP per capita of China in year 2022?

======Round 1======

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

======Round 2======

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

======Round 3======

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

=====Round 4======

* You:
- Thinking: Current information is enough to answer the question. According to document 2 of first search, China's GDP of 2022 is 17,963,171.48 million US dollar. According to document 3 of second search, China's population of 2022 is 1.411 billion.
- Answer: China's GDP per capita of year 2022 is 17963.17 billion US dollar / 1.411 billion = 12730.8 US dollar.
`
  );
}
