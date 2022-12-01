import { messageParser } from "./utils/message-parser.util.js";
import {
  Langs,
  AttributeValidationMinimalInfo,
  ValidationRuleContract,
  ValidationRulesContract,
  ValidationRuleStringNotationContract,
  MessagesContract,
  NiceNamesContract,
  ValidatorErrorContract,
  ValidatorErrorsContract,
  ValidationRuleArrayStringNotationContract,
} from "./contracts.js";
import { reallyEmpty, fillMissingSpots } from "./utils/ops.util.js";
import { getValueByStringNotation, getValuesByWildCardStringNotation } from "./utils/obj.util.js";
import { parseStringNotationRules, parseStringRule } from "./utils/rules-parser.util.js";
import * as MessagesProvider from './messages/provider.js';

import * as config from './config.js';

let RulesProvider: any = {};
let PostRulesProvider: any = {};

/**
 * registerRules will replace old registered rules 
 * @param rules validation rules
 */
export function registerRules(rules: any) {
  // Object.keys(rules).forEach((rule) => {
  //   RulesProvider[rule] = rules[rule];
  // });

  // return RulesProvider;
  return RulesProvider = rules;
}

/**
 * registerPostRules will replace old post validation rules
 * @param rules post validation rules
 */
export function registerPostRules(rules: any) {
  return PostRulesProvider = rules;
}

// you can change this value with static method
let shouldBreakIfFailed = true;

export abstract class ValidatorAbstract {
  implicitRules: Array<string> = config.get('implicitRules');

  // validation errors collection
  errors: ValidatorErrorContract | ValidatorErrorsContract = {};

  // local custom attributes collection
  localNiceNames: NiceNamesContract = {};

  // do we have custom messages?
  hasCustomMessages: boolean = false;

  // notationMap: any = {};
  // notationVals: any = {};

  // do we have nested rules?
  hasNestedRules: boolean = false;

  // rules collection
  parsedRulesCollection: ValidationRulesContract = {};

  lang: Langs = config.get('lang');

  // post validation rules collection
  postRules: Array<any> = [];

  // break rules validation loop when failed
  breakWhenFailed = shouldBreakIfFailed;

  // release attribute from futher validation rules
  shouldRelease = false;

  implicitInputs: NodeJS.Dict<any> = {};

  /**
   * init validator
   * @param inputs 
   * @param rules 
   * @param customMessages 
   */
  constructor(
    private inputs: any = {},
    private rules:
      | ValidationRulesContract
      | ValidationRuleStringNotationContract
      | ValidationRuleArrayStringNotationContract = {},
    private customMessages: MessagesContract = {},
  ) {
    this.hasCustomMessages = Object.keys(customMessages).length > 0;
    this.parse();
  }

  /**
   * globally should break/bail on failed validation or not
   * @param {boolean} sure
   */
  static bailable(sure: boolean) {
    shouldBreakIfFailed = sure;
  }

  /**
   * enable/disable multiple errors on current instance only
   * @param {boolean} sure
   */
  bail(sure: boolean) {
    this.breakWhenFailed = sure;
  }

  /**
   * release attribute from rules validation
   */
  release() {
    this.shouldRelease = true;
  }

  /**
   * check is instance is bailable or not
   * @returns {boolean}
   */
  isBailable(): boolean {
    return this.breakWhenFailed;
  }

  /**
   * allows a custom rule to be added as an implicit rule for the instance only
   * @param {String} ruleName
   */
  addImplicitRule(ruleName: string) {
    this.implicitRules.push(ruleName);
  }

  addRules(rules:
    | ValidationRulesContract
    | ValidationRuleStringNotationContract
    | ValidationRuleArrayStringNotationContract = {}) {
    this.rules = rules;
    this.parseRules();
  }


  async postRuleApply(rule: any) {
    if (rule.rule === 'function') {
      // eslint-disable-next-line no-return-await
      return await rule.handler(this);
    }

    // eslint-disable-next-line no-return-await
    return await PostRulesProvider[rule.rule](rule, this);
  }

  /**
  * add post rule
  *
  * post rule is applied to whole input and is used to check constraints
  * across multiple fields
  *
  * @param {*} rule
 */
  addPostRule(rule: any) {
    if (typeof rule === 'function') {
      this.postRules.push({
        rule: 'function',
        handler: rule,
      });
      return;
    }

    const ruleArray = rule.split(':', 2);
    const ruleName = ruleArray[0];
    const ruleFields = ruleArray[1].split(','); // there always be a list of fields

    this.postRules.push({
      rule: ruleName,
      params: ruleFields,
    });
  }

  /**
    * add set of post rules
    *
    * @param {string[]} postRulesObj
    */
  addPostRules(postRulesObj: any) {
    if (!Array.isArray(postRulesObj)) {
      postRulesObj = postRulesObj.split('|');
    }

    postRulesObj.map((rule: any) => this.addPostRule(rule));
  }

  /**
   * parse provided rules and inputs
   */
  parse() {
    this.parseRules();
    this.parseInputs();
  }

  parseRules() {
    const keys = Object.keys(this.rules);
    const parsed = {};
    for (const key of keys) {
      if (key === '*') {
        this.addPostRules(this.rules[key]);
        continue;
      }

      let rules = this.rules[key];
      if (Array.isArray(rules)) {
        for (const index in rules) {
          if (typeof rules[index] == 'string') {
            rules[index] = parseStringRule(RulesProvider, rules[index] as string);
          }
        }
      } else {
        rules = parseStringNotationRules(RulesProvider, rules);
      }

      rules.sort((obj: any) => {
        return (this.implicitRules.indexOf(obj.name) >= 0) ? -1 : 1;
      });

      let kobj: any = parsed;
      let path = '';
      key.split('.').forEach((k, i) => {
        path += k;

        if (!kobj[k]) {
          kobj[k] = {
            rules: this.rules[path] ? rules : [],
            child: {},
          };
        }

        kobj = kobj[k].child;
        path += '.';
      });
    }

    this.parsedRulesCollection = parsed;
  }

  parseInputs() {
    // if (!this.hasNestedRules) {
    //   return;
    // }
  }

  /**
   * apply this set of filters to inputs
   * @param filters set of filters
   */
  applyFilters(filters: any) {
    // future ref
  }

  /**
  * apply post validation rules
  * @param rules post rules
  */
  applyPostRules(rules: any) {
    // to-do
  }

  /**
   * validate inputs againest rules
   */
  async validate(inputs?: any): Promise<boolean> {
    if (inputs) {
      this.inputs = inputs;
      this.parseInputs();
    }

    // console.log(JSON.stringify(this.parsedRulesCollection, null, 2))

    const keys = Object.keys(this.parsedRulesCollection);
    const len = keys.length;
    let i = 0;
    const promises = [];

    for (i; i < len; i += 1) {
      const attrName = keys[i];
      promises.push(this.applyParsedRules(attrName, this.parsedRulesCollection[attrName], this.inputs));
    }

    // post validation rules
    this.postRules.forEach((postRule: any) => {
      promises.push(this.postRuleApply(postRule));
    });


    await Promise.all(promises);

    return !this.hasErrors();
  }

  async applyParsedRules(attrName: any, rules: any, inputs: any, prefix = '') {
    if (attrName === '*') {
      if (!Array.isArray(inputs)) {
        // this.createAttributeError({
        //     attrName,
        //     attrValue: inputs,
        //     ruleName: 'array',
        //     ruleArgs: [],
        // });
        return
      }

      let i = 0;
      for (const val of inputs) {
        // console.log(i, rules, [val], `${prefix}${i}`);
        await this.applyParsedRules(i, rules, inputs, prefix);
        i += 1;
      }
      return;
    }

    const attrValue = inputs[attrName];


    const info = await this.validateAttribute(attrName, attrValue, rules.rules, { prefix, inputs });

    //console.log(attrName, attrValue, info)
    if (info.empty && info.passed) {
      return;
    }

    for (const cattrName in rules.child) {
      await this.applyParsedRules(cattrName, rules.child[cattrName], attrValue || {}, prefix.length ? `${prefix}${attrName}.` : `${attrName}.`);
      //  break;
    }
  }


  /**
  * apply rules on attribute
  * @param attrName attribute name
  * @param attrRules attribute rules
  */
  async validateAttribute(
    attrName: string,
    attrValue: any,
    attrRules: Array<ValidationRuleContract>,
    { prefix, inputs }: any,
  ) {
    const info = {
      implicit: false,
      implicitFailed: false,
      passed: true,
      empty: reallyEmpty(attrValue),
    };


    let i = 0;
    let len = attrRules.length;

    for (i; i < len; i += 1) {
      const validationRule: ValidationRuleContract = attrRules[i];
      const isImplicitRule = this.implicitRules.indexOf(validationRule.name) >= 0;

      if (isImplicitRule) {
        info.implicit = true;
      }

      if (!isImplicitRule && info.empty) {
        if (this.isBailable()) {
          return info;
        }
        attrValue = '';
      }

      const passed = await validationRule.handler(attrValue, this, attrName, { path: prefix + attrName, inputs });

      if (passed == -1) {
        continue;
      }

      this.shouldRelease = false;

      if (!passed) {
        info.passed = false;
        this.createAttributeError({
          attrName: prefix + attrName,
          attrValue,
          ruleName: validationRule.name,
          ruleArgs: validationRule.args,
        });

        if (this.isBailable()) {
          return info;
        }
      }
    }
    return info;
  }

  /**
  * this will create error object for attribute
  * @param params info object
  */
  createAttributeError(params: AttributeValidationMinimalInfo): void {
    const { attrName, ruleName } = params;

    const error = {
      rule: ruleName,
      message: this.createAttributeErrorMessage(params),
    };

    if (!this.breakWhenFailed) {
      if (!this.errors[attrName]) {
        this.errors[attrName] = [];
      }

      // @ts-ignore
      this.errors[attrName].push(error);
      return;
    }
    this.errors[attrName] = error;
  }

  /**
   * this will return parsed error message as per rule or input
   * @param params object with attr and rule name, value, args
   */
  createAttributeErrorMessage(
    params: AttributeValidationMinimalInfo,
    useDefaultMessage: boolean = true,
  ): string {
    const { attrName, ruleName, attrValue, ruleArgs } = params;

    const messagesCollection: any = MessagesProvider.messagesRefByLang(this.lang);
    const defaultMessage = messagesCollection.$default;

    let message: any;

    // check for local scope messages
    if (this.hasCustomMessages) {
      message = this.customMessages[`${attrName}.${ruleName}`] ||
        this.customMessages[ruleName] ||
        this.customMessages[attrName];
    }

    // not found in local scope, check for global scope
    if (!message) {
      message = (messagesCollection.$custom &&
        messagesCollection.$custom[`${attrName}.${ruleName}`]) ||
        (messagesCollection.$custom && messagesCollection.$custom[attrName]) ||
        messagesCollection[ruleName];

      if (useDefaultMessage && !message) {
        message = defaultMessage;
      }
    }

    let attributeName = attrName;

    let niceName;

    // check if we have nice name in local scope
    if (this.localNiceNames[attrName]) {
      niceName = this.localNiceNames[attrName];
    } else if (
      messagesCollection.$niceNames && messagesCollection.$niceNames[attrName]
    ) {
      // check if we have nice name in global scope
      niceName = messagesCollection.$niceNames[attrName];
    }

    return messageParser({
      message,
      attrName: attributeName,
      niceName,
      ruleName,
      attrValue,
      ruleArgs,
    });
  }

  /**
  * get attribute value by its name
  * @param attr attribute name
  */
  attributeValue(attr: string): any {
    return getValueByStringNotation(this.inputs, attr);
    // return this.inputs[attr] || this.notationVals[attr];
  }

  /**
   * check if attribute has value
   * @param attr attribute name
   */
  doAttributeHasValue(attr: string): boolean {
    return this.attributeValue(attr) === undefined ? true : false;
  }

  /**
   * does attribute present in given inputs
   * @param attr attribute name
   */
  isAttributePresent(attr: string): boolean {
    if (this.inputs[attr] != undefined) {
      return true;
    }

    return false;
  }

  /**
   * does we have any dirty/failed input
   */
  hasErrors(): boolean {
    return Object.keys(this.errors).length > 0;
  }

  /**
   * get validation errors
   */
  getErrors(): any {
    return this.errors;
  }

  niceNames(niceNames: NiceNamesContract) {
    this.localNiceNames = niceNames;
  }
}
