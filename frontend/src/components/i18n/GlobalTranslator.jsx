import { useEffect } from 'react';
import useLanguageStore from '../../store/languageStore';
import { translate } from '../../i18n/translations';

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME']);
const ATTRIBUTES = ['placeholder', 'aria-label', 'title'];

const restoreAttributes = (node) => {
  if (!node?.getAttribute || !node.__zwOriginalAttrs) return;
  ATTRIBUTES.forEach((attr) => {
    if (node.__zwOriginalAttrs[attr] !== undefined) node.setAttribute(attr, node.__zwOriginalAttrs[attr]);
  });
};

const restoreNode = (node) => {
  if (node.nodeType === Node.TEXT_NODE) {
    if (node.__zwOriginalText !== undefined) node.nodeValue = node.__zwOriginalText;
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  restoreAttributes(node);
  Array.from(node.childNodes).forEach((child) => restoreNode(child));
};

const translateAttributes = (node, language) => {
  if (!node.getAttribute) return;
  if (node.closest?.('[data-no-translate="true"]')) return;
  ATTRIBUTES.forEach((attr) => {
    if (!node.hasAttribute(attr)) return;
    node.__zwOriginalAttrs = node.__zwOriginalAttrs || {};
    node.__zwTranslatedAttrs = node.__zwTranslatedAttrs || {};
    const current = node.getAttribute(attr);
    const previousTranslated = node.__zwTranslatedAttrs[attr];
    if (!node.__zwOriginalAttrs[attr] || (current !== previousTranslated && current !== node.__zwOriginalAttrs[attr])) {
      node.__zwOriginalAttrs[attr] = current;
    }
    const original = node.__zwOriginalAttrs[attr];
    node.__zwOriginalAttrs[attr] = original;
    const translated = translate(original, language);
    node.__zwTranslatedAttrs[attr] = translated;
    if (node.getAttribute(attr) !== translated) node.setAttribute(attr, translated);
  });
};

const translateNode = (node, language) => {
  if (node.nodeType === Node.TEXT_NODE) {
    if (node.parentElement?.closest?.('[data-no-translate="true"]')) return;
    const current = node.nodeValue;
    if (!node.__zwOriginalText || (current !== node.__zwTranslatedText && current !== node.__zwOriginalText)) {
      node.__zwOriginalText = current;
    }
    const original = node.__zwOriginalText;
    node.__zwOriginalText = original;
    const translated = translate(original, language);
    node.__zwTranslatedText = translated;
    if (node.nodeValue !== translated) node.nodeValue = translated;
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  if (node.closest?.('[data-no-translate="true"]')) return;
  translateAttributes(node, language);
  if (SKIP_TAGS.has(node.tagName)) return;
  Array.from(node.childNodes).forEach((child) => translateNode(child, language));
};

export default function GlobalTranslator() {
  const language = useLanguageStore((state) => state.language);

  useEffect(() => {
    if (language === 'ru') restoreNode(document.body);
    else translateNode(document.body, language);
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (language === 'ru') restoreNode(node);
          else translateNode(node, language);
        });
        if (mutation.type === 'characterData') {
          if (language === 'ru') restoreNode(mutation.target);
          else translateNode(mutation.target, language);
        }
        if (mutation.type === 'attributes' && language !== 'ru') translateAttributes(mutation.target, language);
      });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRIBUTES });
    return () => observer.disconnect();
  }, [language]);

  return null;
}
