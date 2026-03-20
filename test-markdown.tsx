import React from 'react';
import { renderToString } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';

const md = "This is <mark>**bold**</mark> text.";
const html = renderToString(<ReactMarkdown rehypePlugins={[rehypeRaw]}>{md}</ReactMarkdown>);
console.log(html);
