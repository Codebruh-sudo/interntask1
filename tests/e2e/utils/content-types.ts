import { isBoolean, isNumber, isString, kebabCase, snakeCase } from 'lodash/fp';
import { waitForRestart } from './restart';
import pluralize from 'pluralize';
import { expect, type Page } from '@playwright/test';
import { clickAndWait, ensureCheckbox, findByRowColumn, navToHeader } from './shared';
import { rowHeight } from '@strapi/admin/admin/src/pages/Settings/pages/Roles/utils/constants';

export interface AddAttribute {
  type: string;
  name?: string;
  advanced?: AdvancedAttributeSettings;
  number?: { format: numberFormat };
  date?: { format: dateFormat };
  media?: { multiple: boolean };
  enumeration?: { values: string[] };
  component?: { useExisting?: string; options: Partial<AddComponentOptions> };
  dz?: {
    components: AddComponentAttribute[];
  };
  relation?: {
    type: keyof typeof relationsMap;
    target: {
      name?: string;
      select?: string;
    };
  };
}

// keys are the relation types used by the RelationNaturePicker component
// locatorText is the text that should be displayed for the relation type
// inverted denotes the inverse relation type(s)
export const relationsMap: Record<
  string,
  {
    locatorText: string;
    hasInverse: boolean;
    inverted?: boolean;
    pluralizeTarget?: boolean;
    pluralizeName?: boolean;
  }
> = {
  oneWay: {
    locatorText: 'has one',
    hasInverse: false,
    pluralizeTarget: false,
    pluralizeName: false,
  },
  oneToOne: {
    locatorText: 'has and belongs to one',
    hasInverse: true,
    pluralizeTarget: false,
    pluralizeName: false,
  },
  oneToMany: {
    locatorText: 'belongs to many',
    hasInverse: true,
    pluralizeTarget: false,
    pluralizeName: true,
  },
  manyToOne: {
    locatorText: 'has many',
    inverted: true,
    hasInverse: true,
    pluralizeTarget: true,
    pluralizeName: false,
  },
  manyToMany: {
    locatorText: 'has and belongs to many',
    hasInverse: true,
    pluralizeTarget: true,
    pluralizeName: true,
  },
  manyWay: {
    locatorText: 'has many',
    hasInverse: false,
    pluralizeTarget: true,
    pluralizeName: true,
  },
} as const;

// Advanced Settings for all types
// TODO: split this into settings based on the attribute type
interface AdvancedAttributeSettings {
  required?: boolean;
  unique?: boolean;
  maximum?: number;
  minimum?: number;
  private?: boolean;
  default?: any;
  regexp?: string;
}

interface AddComponentAttribute extends AddAttribute {
  type: 'component';
}

interface AddDynamicZoneAttribute extends AddAttribute {
  type: 'dz';
}

interface AddRelationAttribute extends AddAttribute {
  type: 'relation';
}

// Type guard function to check if an attribute is a ComponentAttribute
function isComponentAttribute(attribute: AddAttribute): attribute is AddComponentAttribute {
  return attribute.type === 'component';
}
function isDynamicZoneAttribute(attribute: AddAttribute): attribute is AddDynamicZoneAttribute {
  return attribute.type === 'dz';
}

function isRelationAttribute(attribute: AddAttribute): attribute is AddRelationAttribute {
  return attribute.type === 'relation';
}

type numberFormat = 'integer' | 'big integer' | 'decimal';
type dateFormat = 'date' | 'time' | 'datetime';

export interface CreateContentTypeOptions {
  name: string;
  singularId?: string;
  pluralId?: string;
  attributes: AddAttribute[];
}

export interface CreateComponentOptions {
  name: string;
  icon: string;
  attributes: AddAttribute[];
  categoryCreate?: string;
  categorySelect?: string;
}

export interface CategoryCreateOption {
  categoryCreate: string;
  categorySelect?: never;
}

export interface CategorySelectOption {
  categorySelect: string;
  categoryCreate?: never;
}

type AddComponentOptions = {
  repeatable: boolean;
} & CreateComponentOptions;

// lookup table for attribute types+subtypes so they can be found
// buttonName is the header of the button clicked from the "Add Attribute" screen
// listLabel is how they appear in the list of all attributes on the content type page
// This is necessary because the labels used for each attribute type differ based on
// their other attribute options
export const typeMap = {
  text: { buttonName: 'Text', listLabel: 'Text' },
  boolean: { buttonName: 'Boolean', listLabel: 'Boolean' },
  blocks: { buttonName: 'Rich text (blocks)', listLabel: 'Rich text (blocks)' },
  json: { buttonName: 'JSON', listLabel: 'JSON' },
  number: { buttonName: 'Number', listLabel: 'Number' },
  email: { buttonName: 'Email', listLabel: 'Email' },
  date_date: { buttonName: 'Date', listLabel: 'Date' },
  date_time: { buttonName: 'Date', listLabel: 'Time' },
  date_datetime: { buttonName: 'Date', listLabel: 'Datetime' },
  password: { buttonName: 'Password', listLabel: 'Password' },
  media: { buttonName: 'Media', listLabel: 'Media' },
  enumeration: { buttonName: 'Enumeration', listLabel: 'Enumeration' },
  relation: { buttonName: 'Relation', listLabel: 'Relation' },
  markdown: { buttonName: 'Rich text (Markdown)', listLabel: 'Rich text (Markdown)' },
  component: { buttonName: 'Component', listLabel: 'Component' },
  component_repeatable: { buttonName: 'Component', listLabel: 'Repeatable Component' },
  dz: { buttonName: 'Dynamic Zone', listLabel: 'Dynamic Zone' },
};

const getAttributeIdentifiers = (attribute: AddAttribute) => {
  let type = attribute.type;
  if (attribute.component?.options?.repeatable) {
    type = 'component_repeatable';
  } else if (attribute.date?.format) {
    type = 'date_' + attribute.date.format;
  }

  return typeMap[type];
};

// Select a component icon
export const selectComponentIcon = async (page: Page, icon: string) => {
  // Test the search and avoiding needing to scroll to the icon
  const searchButton = page.getByRole('button', { name: 'Search icon button' });
  await clickAndWait(page, searchButton);
  const searchInput = page.getByPlaceholder('Search for an icon');
  await searchInput.fill(icon);

  // click the icon
  const iconResult = page.locator(`label:has(input[type="radio"][value="${icon}"])`);
  await clickAndWait(page, iconResult);

  // verify the correct icon was selected
  const isChecked = await iconResult.isChecked();
  expect(isChecked).toBe(true);
};

// open the component builder
export const openComponentBuilder = async (page: Page) => {
  await clickAndWait(page, page.getByRole('link', { name: 'Content-Type Builder' }));
  await clickAndWait(page, page.getByRole('button', { name: 'Create new component' }));
};

// The initial "create a component" screen from the content type builder nav
// also supports "create a component" from within a dz
export const fillCreateComponent = async (page: Page, options: Partial<CreateComponentOptions>) => {
  if (options.name) {
    const displayNameLocator = page.getByLabel('Display name');
    if (await displayNameLocator.isVisible({ timeout: 0 })) {
      await displayNameLocator.fill(options.name);
    } else {
      const nameLocator = page.getByLabel('Name', { exact: true });
      if (await nameLocator.isVisible({ timeout: 0 })) {
        await nameLocator.fill(options.name);
      }
    }
  }

  if (options.icon) {
    await selectComponentIcon(page, options.icon);
  }

  if (options.categoryCreate) {
    await page
      .getByLabel(/Select a category or enter a name to create a new one/i)
      .fill(options.categoryCreate);
  }

  if (options.categorySelect) {
    const displayName = kebabCase(options.categorySelect);
    await clickAndWait(
      page,
      page.getByLabel(/Select a category or enter a name to create a new one/i)
    );
    await page.getByLabel(displayName).scrollIntoViewIfNeeded();
    await clickAndWait(page, page.getByLabel(displayName));
  }
};

// The screen when a component is added as an attribute
export const fillAddComponentAttribute = async (
  page: Page,
  component: AddAttribute['component']
) => {
  if (component.options.name) {
    await fillComponentName(page, component.options.name);
  }

  // if existing component, select it
  if (component.useExisting) {
    // open the list
    await page.getByRole('combobox', { name: 'component' }).click();
    // select the item
    const item = page
      .locator('[role="presentation"] [role="option"]')
      .filter({ hasText: new RegExp(component.useExisting, 'i') });

    await item.scrollIntoViewIfNeeded();
    await item.click();

    // close the select menu
    if (await page.getByText('component selected').isVisible({ timeout: 0 })) {
      await page.getByText('component selected').click({ force: true });
    }
  }

  await selectComponentRepeatable(page, component.options.repeatable);
};

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const fillComponentName = async (page: Page, name: string) => {
  const displayNameLocator = page.getByLabel('Display name');
  if (await displayNameLocator.isVisible({ timeout: 0 })) {
    await displayNameLocator.fill(name);
  } else {
    const nameLocator = page.getByLabel('Name', { exact: true });
    if (await nameLocator.isVisible({ timeout: 0 })) {
      await nameLocator.fill(name);
    }
  }
};

export const selectComponentRepeatable = async (page: Page, value: boolean) => {
  // Check if the "repeatable" options are present
  if (await page.locator('input[name="repeatable"]').first().isVisible({ timeout: 0 })) {
    const repeatableValue = value ? 'true' : 'false';
    const radioButton = page.locator(`input[name="repeatable"][value="${repeatableValue}"]`);
    await radioButton.click({ force: true });
  }
};

function hasInverse(relation: AddAttribute['relation']): relation is AddAttribute['relation'] & {
  type: keyof typeof relationsMap;
  target: { name?: string; select?: string };
} {
  return relationsMap[relation?.type]?.hasInverse ?? false;
}

function isInverted(relation: AddAttribute['relation']): relation is AddAttribute['relation'] & {
  type: keyof typeof relationsMap;
  target: { name?: string; select?: string };
} {
  const relationType = relation?.type;
  if (!relationType) return false;
  const relationConfig = relationsMap[relationType];
  return Boolean(relationConfig?.inverted);
}

export const addRelationAttribute = async (
  page: Page,
  attribute: AddRelationAttribute,
  options?: AttributeOptions
) => {
  const { relation, name } = attribute;
  const target = relation?.target;
  const targetSelect = target?.select;
  const relationText = relationsMap[relation?.type]?.locatorText;

  // Click the correct relation type button
  // instead of using aria-label we need to use data-relation-type with the relation type itself
  await page.locator(`button[data-relation-type="${relation?.type}"]`).click();
  // check that the button is now aria-pressed
  await expect(page.locator(`button[data-relation-type="${relation?.type}"]`)).toHaveAttribute(
    'aria-pressed',
    'true'
  );

  // Select the relation type if `targetSelect` is provided
  const dialog = page.getByRole('dialog'); // Locate the dialog
  const relationTypePicker = dialog.locator('button[aria-haspopup="menu"]'); // Find the button inside it

  if (targetSelect) {
    await relationTypePicker.click();
    await page.getByRole('menuitem', { name: targetSelect }).click();
  }

  // Verify expected text in the relation type picker
  const expectedText = isInverted(relation)
    ? `${targetSelect} ${relationText}`
    : `${relationText} ${targetSelect}`;
  await expect(dialog).toContainText(expectedText);

  const nameFieldValue = await page.locator('input[name="name"]').inputValue();
  const targetNameFieldValue = await page.locator('input[name="targetAttribute"]').inputValue();

  // check that the name field is filled with the target name in the correct pluralization
  expect(nameFieldValue).toBe(
    snakeCase(
      relationsMap[relation?.type]?.pluralizeName
        ? pluralize(target?.select?.toLowerCase())
        : target?.select?.toLowerCase()
    )
  );

  // verify the target field is filled with the correct pluralization
  if (options?.contentTypeName && hasInverse(relation)) {
    expect(targetNameFieldValue).toBe(
      snakeCase(
        relationsMap[relation?.type]?.pluralizeTarget
          ? pluralize(options.contentTypeName.toLowerCase())
          : options.contentTypeName.toLowerCase()
      )
    );
  }

  //  fill in target attribute or ensure it is disabled
  const targetAttributeInput = page.locator('input[name="targetAttribute"]');

  if (hasInverse(relation)) {
    if (relation.target.name) {
      await targetAttributeInput.fill(relation.target.name);
    }
  } else {
    await expect(targetAttributeInput).toBeDisabled();
  }

  // Fill in the "Name" field if provided
  if (name) {
    await page.locator('input[name="name"]').fill(name);
  }

  await page.getByRole('button', { name: 'Finish' }).click();
};

export const addComponentAttribute = async (
  page: Page,
  attribute: AddComponentAttribute,
  options: any = {}
) => {
  const attrCompOptions = attribute.component.options;

  const useExistingLabel = attribute.component.useExisting ? 'false' : 'true';
  await page.click(`label[for="${useExistingLabel}"]`);

  // if "select a component"
  if (await page.getByRole('button', { name: 'Select a component' }).isVisible({ timeout: 0 })) {
    await clickAndWait(page, page.getByRole('button', { name: 'Select a component' }));
    await fillAddComponentAttribute(page, attribute.component);
  }
  // if "configure a component"
  else if (
    await page.getByRole('button', { name: 'Configure the component' }).isVisible({ timeout: 0 })
  ) {
    await fillCreateComponent(page, { ...attrCompOptions, name: attribute.name });
    await clickAndWait(page, page.getByRole('button', { name: 'Configure the component' }));
  }
  // if using an existing component
  else if (attribute.component.useExisting) {
    await fillAddComponentAttribute(page, attribute.component);
  }
  //??
  else {
    await fillCreateComponent(page, { ...attrCompOptions, name: attribute.name });
  }

  await fillComponentName(page, attribute.name);

  await selectComponentRepeatable(page, attribute.component?.options.repeatable);

  if (attrCompOptions.attributes) {
    const addFirstFieldButton = page.getByRole('button', {
      name: new RegExp('Add first field to the component', 'i'),
    });
    const addAnotherFieldButton = page.getByRole('button', {
      name: new RegExp('Add another field', 'i'),
    });

    if (await addFirstFieldButton.isVisible({ timeout: 0 })) {
      await clickAndWait(page, addFirstFieldButton);
    } else if (await addAnotherFieldButton.isVisible({ timeout: 0 })) {
      await clickAndWait(page, addAnotherFieldButton);
    }

    await addAttributes(page, attrCompOptions.attributes, { clickFinish: false, ...options });
  }
};

export const addDynamicZoneAttribute = async (page: Page, attribute: AddDynamicZoneAttribute) => {
  // Fill the name of the dynamic zone
  await page.getByLabel('Name', { exact: true }).fill(attribute.name);

  // Click the "Add components to the zone" button to start adding components
  await clickAndWait(
    page,
    page.getByRole('button', { name: new RegExp('Add components to the zone', 'i') })
  );

  // Add the components to the dynamic zone
  await addAttributes(page, attribute.dz.components, {
    fromDz: attribute.name, // Pass the DZ name to ensure subsequent components are added to the DZ
  });

  // Finish the dynamic zone creation
  const finishButton = page.getByRole('button', { name: 'Finish' });
  if (await finishButton.isVisible({ timeout: 0 })) {
    await finishButton.click();
  }
};

// Add contentTypeName to options interface
interface AttributeOptions {
  fromDz?: string;
  contentTypeName?: string;
  clickFinish?: boolean;
}

export const fillAttribute = async (
  page: Page,
  attribute: AddAttribute,
  options?: AttributeOptions
) => {
  // check if we need to click the attribute button or if we're already on the attribute to fill
  const onFieldTypeSelection = await page
    .getByRole('heading', { name: /Select a field for your/i })
    .isVisible({ timeout: 0 });

  if (onFieldTypeSelection) {
    const tabPanel = page.getByRole('tabpanel');
    // Target a button within tabPanel that contains a span with the exact text of attribute.type
    await clickAndWait(
      page,
      tabPanel.locator(`button:has(span)`, {
        hasText: new RegExp(`^${escapeRegExp(getAttributeIdentifiers(attribute).buttonName)}`, 'i'),
      })
    );
  }

  // components are handled separately
  if (isComponentAttribute(attribute)) {
    return await addComponentAttribute(page, attribute, options);
  } else if (isDynamicZoneAttribute(attribute)) {
    return await addDynamicZoneAttribute(page, attribute);
  } else if (isRelationAttribute(attribute)) {
    return await addRelationAttribute(page, attribute, options);
  }

  // Fill the input with the exact label "Name"
  await page.getByLabel('Name', { exact: true }).fill(attribute.name);

  // TODO: add a tool for handling Strapi pseudo-select lists so we don't have to handle it custom (and error-prone) each time like number and date

  if (attribute.number?.format) {
    const format = attribute.number.format;

    const list = page.getByText('Choose here', { exact: true }).first();
    // open the list
    await clickAndWait(page, list);
    // click the targeted element
    await clickAndWait(page, page.getByText(new RegExp('^' + format, 'i')).first());
  }

  if (attribute.date?.format) {
    const format = attribute.date.format;

    // open the list
    const list = page.getByText('Choose here', { exact: true }).first();
    await clickAndWait(page, list);
    // select the item
    await clickAndWait(page, page.getByText(new RegExp('^' + format, 'i')).first());
  }

  if (attribute.media?.multiple !== undefined) {
    // TODO: there has to be a better way; if not, improve the html so we can target better
    const multipleValue = attribute.media.multiple ? 'true' : 'false';
    await clickAndWait(page, page.locator(`label[for="${multipleValue}"]`));
  }

  if (attribute.enumeration?.values) {
    await page.locator('textarea[name="enum"]').fill(attribute.enumeration?.values.join('\n'));
  }

  if (attribute.advanced) {
    const advanced = attribute.advanced;
    await page.getByText('Advanced Settings').click();

    if (isBoolean(advanced.required)) {
      const checkbox = page.getByRole('checkbox', { name: 'Required field' });
      await ensureCheckbox(checkbox, advanced.required);
    }

    if (isString(advanced.regexp)) {
      await page.getByLabel('Regexp').fill(advanced.regexp);
    }

    if (isBoolean(advanced.unique)) {
      const checkbox = page.getByRole('checkbox', { name: 'Unique field' });
      await ensureCheckbox(checkbox, advanced.unique);
    }

    if (isBoolean(advanced.private)) {
      const checkbox = page.getByRole('checkbox', { name: 'Private field' });
      await ensureCheckbox(checkbox, advanced.private);
    }

    if (isNumber(advanced.maximum)) {
      await page.getByLabel('Maximum').fill(advanced.maximum.toString());
    }

    if (isNumber(advanced.minimum)) {
      await page.getByLabel('Minimum').fill(advanced.minimum.toString());
    }

    if (isString(advanced.default)) {
      await page.getByLabel('Default').fill(advanced.default);
    }
  }
};

export const addAttributes = async (
  page: Page,
  attributes: AddAttribute[],
  options?: AttributeOptions
) => {
  for (let i = 0; i < attributes.length; i++) {
    const attribute = attributes[i];
    await fillAttribute(page, attribute, options);

    if (i < attributes.length - 1) {
      if (options?.fromDz) {
        // Locate the row containing the DZ name
        const dzRow = page.locator('div').filter({ hasText: options.fromDz }).first();

        // Locate the next sibling row and find the "Add a component" button
        const nextRow = dzRow.locator('xpath=following-sibling::tr[1]');
        const addComponentButton = nextRow.locator('button:has-text("Add a component")');

        // Click the button
        await clickAndWait(page, addComponentButton);
      } else {
        // Regular attribute: click 'Add Another Field'
        await clickAndWait(
          page,
          page.getByRole('button', { name: new RegExp('^Add Another Field$', 'i'), exact: true })
        );
      }
    } else {
      // Last attribute, click 'Finish' only if it's visible
      if (await page.getByRole('button', { name: 'Finish' }).isVisible({ timeout: 0 })) {
        await page.getByRole('button', { name: 'Finish' }).click({ force: true });
      }
    }
  }
};

const saveAndVerifyContent = async (
  page: Page,
  options: { name: string; attributes: AddAttribute[] }
) => {
  await clickAndWait(page, page.getByRole('button', { name: 'Save' }));
  await waitForRestart(page);

  // This must be case insensitive to cover up a minor display bug in the Strapi Admin where headers are always capitalized
  const header = page.getByRole('heading', {
    name: new RegExp(`^${options.name}$`, 'i'),
  });
  await expect(header).toBeVisible();

  for (let i = 0; i < options.attributes.length; i++) {
    const attribute = options.attributes[i];
    const name = attribute.name || attribute.component?.options.name;
    const row = await page.getByLabel(name);

    if (!getAttributeIdentifiers(attribute).buttonName) {
      throw new Error('unknown type ' + attribute.type);
    }

    const { listLabel } = getAttributeIdentifiers(attribute);
    await expect(row).toContainText(listLabel, {
      ignoreCase: true,
    });
  }

  // TODO: verify that it appears in the sidenav
};

// Refactored method for creating a component
export const createComponent = async (page: Page, options: CreateComponentOptions) => {
  await openComponentBuilder(page);
  await fillCreateComponent(page, options);

  await clickAndWait(page, page.getByRole('button', { name: 'Continue' }));

  await clickAndWait(page, page.getByRole('button', { name: 'Add new field' }).first());

  await addAttributes(page, options.attributes, { contentTypeName: options.name });

  await saveAndVerifyContent(page, options);
};

// Helper function for creating content types
const createContentType = async (
  page: Page,
  options: CreateContentTypeOptions,
  type: 'single' | 'collection'
) => {
  const { name, singularId, pluralId } = options;

  const buttonName = type === 'single' ? 'Create new single type' : 'Create new collection type';
  const headingName = type === 'single' ? 'Create a single type' : 'Create a collection type';

  await page.getByRole('button', { name: buttonName }).click();
  await expect(page.getByRole('heading', { name: headingName })).toBeVisible();

  const displayName = page.getByLabel('Display name');
  await displayName.fill(name);

  const singularIdField = page.getByLabel('API ID (Singular)');
  await expect(singularIdField).toHaveValue(singularId || kebabCase(name));
  if (singularId) {
    singularIdField.fill(singularId);
  }

  const pluralIdField = page.getByLabel('API ID (Plural)');
  await expect(pluralIdField).toHaveValue(pluralId || pluralize(kebabCase(name)));
  if (pluralId) {
    pluralIdField.fill(pluralId);
  }

  await page.getByRole('button', { name: 'Continue' }).click();

  await clickAndWait(page, page.getByRole('button', { name: 'Add new field' }).first());

  await addAttributes(page, options.attributes, { contentTypeName: name });

  await saveAndVerifyContent(page, options);
};

// Refactored method for creating a single type
export const createSingleType = async (page: Page, options: CreateContentTypeOptions) => {
  await createContentType(page, options, 'single');
};

// Refactored method for creating a collection type
export const createCollectionType = async (page: Page, options: CreateContentTypeOptions) => {
  await createContentType(page, options, 'collection');
};

export const addAttributeToComponent = async (
  page: Page,
  componentName: string,
  attribute: AddAttribute
) => {
  await clickAndWait(page, page.getByRole('link', { name: 'Content-Type Builder' }));
  await clickAndWait(page, page.getByRole('link', { name: componentName }));
  await clickAndWait(
    page,
    page.getByRole('button', { name: 'Add another field to this component' })
  );
  await addAttributes(page, [attribute]);

  await saveAndVerifyContent(page, {
    name: componentName,
    attributes: [attribute],
  });
};

export const addAttributesToContentType = async (
  page: Page,
  ctName: string,
  attributes: AddAttribute[]
) => {
  await navToHeader(page, ['Content-Type Builder', ctName], ctName);

  await clickAndWait(page, page.getByRole('button', { name: 'Add another field', exact: true }));

  await addAttributes(page, attributes, { contentTypeName: ctName });

  await page.getByRole('button', { name: 'Save' }).click();

  await waitForRestart(page);
};

export const removeAttributeFromComponent = async (
  page: Page,
  componentName: string,
  attributeName: string
) => {
  await clickAndWait(page, page.getByRole('link', { name: 'Content-Type Builder' }));
  await clickAndWait(page, page.getByRole('link', { name: componentName }));
  await clickAndWait(page, page.getByRole('button', { name: 'Delete ' + attributeName }));

  await saveAndVerifyContent(page, { name: componentName, attributes: [] });
};

export const deleteComponent = async (page: Page, componentName: string) => {
  await clickAndWait(page, page.getByRole('link', { name: 'Content-Type Builder' }));
  await clickAndWait(page, page.getByRole('link', { name: componentName }));
  await clickAndWait(page, page.getByRole('button', { name: 'Edit', exact: true }));

  // need to accept the browser modal
  page.on('dialog', (dialog) => dialog.accept());
  await clickAndWait(page, page.getByRole('button', { name: 'Delete', exact: true }));
  await clickAndWait(page, page.getByRole('button', { name: 'Save' }));

  await waitForRestart(page);
};
