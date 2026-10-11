import { CARD_LIMITS, CardInput } from '../../interfaces/Cards/card';
import { cardSlug, validateCardId, validateCardInput } from './card-validation';

describe('Validação do domínio Cards', () => {
  function input(): CardInput {
    return {
      name: ' Dragão ', description: ' Uma carta ', rarity: 'rare', status: 'draft', setId: null,
      attributes: [{ key: 'custom-power', label: ' Poder próprio ', value: 92.5 }]
    };
  }

  it('normaliza texto sem fixar o domínio aos quatro atributos iniciais', () => {
    const original = input();
    const value = validateCardInput(original);
    expect(value.name).toBe('Dragão');
    expect(value.description).toBe('Uma carta');
    expect(value.attributes).toEqual([{ key: 'custom-power', label: 'Poder próprio', value: 92.5 }]);
    expect(original.name).toBe(' Dragão ');
    expect(original.attributes[0].label).toBe(' Poder próprio ');
  });

  it('aceita limites inclusivos e rejeita percentuais inválidos ou não finitos', () => {
    for (const value of [0, 100]) {
      const card = input();
      card.attributes[0].value = value;
      expect(() => validateCardInput(card)).not.toThrow();
    }
    for (const value of [-1, 100.001, Number.NaN, Number.POSITIVE_INFINITY]) {
      const card = input();
      card.attributes[0].value = value;
      expect(() => validateCardInput(card)).toThrowError('Os valores dos atributos devem estar entre 0 e 100.');
    }
  });

  it('rejeita chaves duplicadas após trim e listas acima do limite persistido', () => {
    const duplicate = input();
    duplicate.attributes.push({ key: ' custom-power ', label: 'Outro poder', value: 5 });
    expect(() => validateCardInput(duplicate)).toThrowError(/está repetida/);
    const tooMany = input();
    tooMany.attributes = Array.from({ length: CARD_LIMITS.attributes + 1 }, (_, index) => ({ key: `custom_${index}`, label: 'Poder', value: 0 }));
    expect(() => validateCardInput(tooMany)).toThrowError(`A carta permite até ${CARD_LIMITS.attributes} atributos.`);
  });

  it('rejeita textos vazios e chaves que não correspondem às Rules', () => {
    const empty = input();
    empty.name = '   ';
    expect(() => validateCardInput(empty)).toThrowError(/Informe um nome/);
    for (const key of ['attack.power', 'Attack', '1attack', 'x'.repeat(41)]) {
      const card = input();
      card.attributes[0].key = key;
      expect(() => validateCardInput(card)).toThrowError(/Use chaves/);
    }
  });

  it('gera slug válido mesmo com caracteres Unicode expandidos ou sem letras latinas', () => {
    expect(cardSlug('Dragão de Fogo')).toBe('dragao-de-fogo');
    const expanded = cardSlug('\ufb03'.repeat(120));
    expect(expanded.length).toBe(120);
    expect(expanded).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(cardSlug('魔法')).toBe('carta');
    expect(cardSlug('a'.repeat(119) + ' ')).toBe('a'.repeat(119));
  });

  it('impede IDs com segmentos de caminho e associação vazia de coleção', () => {
    expect(() => validateCardId('cards/other')).toThrowError('Identificador de carta inválido.');
    expect(() => validateCardId('../other')).toThrowError('Identificador de carta inválido.');
    const card = input();
    card.setId = '   ';
    expect(() => validateCardInput(card)).toThrowError(/identificador da coleção/);
  });

  it('evolui atributos com limites customizados sem alterar os defaults de cartas antigas', () => {
    const card = input();
    card.attributes = [{ id: 'health', key: 'health', label: 'Vida', value: 250, min: 0, max: 1000, icon: '♥', color: '#ff0000' }];
    expect(validateCardInput(card).attributes).toEqual(card.attributes);
    card.attributes[0].value = 1001;
    expect(() => validateCardInput(card)).toThrowError(/deve estar entre 0 e 1000/);
    card.attributes[0].value = 250;
    card.attributes[0].min = 1000;
    expect(() => validateCardInput(card)).toThrowError(/mínimo.*menor/);
  });

  it('rejeita bounds não finitos, campos estranhos e IDs repetidos de atributos', () => {
    const card = input();
    card.attributes[0].max = Number.POSITIVE_INFINITY;
    expect(() => validateCardInput(card)).toThrowError(/limites dos atributos/);
    expect(() => validateCardInput({ ...input(), secret: 'extra' })).toThrowError(/Campo desconhecido/);
    card.attributes = [
      { id: 'same', key: 'attack', label: 'Ataque', value: 1 },
      { id: 'same', key: 'defense', label: 'Defesa', value: 1 }
    ];
    expect(() => validateCardInput(card)).toThrowError('IDs de atributo repetidos.');
  });
});
