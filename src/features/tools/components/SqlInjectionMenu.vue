<template>
  <VMenu submenu>
    <template #activator="{ props }">
      <VListItem
        :append-icon="mdiChevronRight"
        title="SQLi"
        v-bind="props"
        @click.stop
      />
    </template>
    <VList>
      <VMenu location="end" open-on-hover>
        <template #activator="{ props }">
          <VListItem
            :append-icon="mdiChevronRight"
            title="MySQL"
            v-bind="props"
            @click.stop
          />
        </template>
        <VList>
          <VListItem
            :title="$t('Dump all database names')"
            @click="openSqlInjectionPrompt('Payload.SQLi.MySQL.dumpDatabases')"
          />
          <VListItem
            :title="$t('Dump tables from database')"
            @click="openSqlInjectionPrompt('Payload.SQLi.MySQL.dumpTables')"
          />
          <VListItem
            :title="$t('Dump columns from database')"
            @click="openSqlInjectionPrompt('Payload.SQLi.MySQL.dumpColumns')"
          />
          <VListItem
            :title="$t('Dump current queries payload')"
            @click="
              applyFunction('Payload.SQLi.MySQL.dumpCurrentQueries', true)
            "
          />
          <VListItem
            :title="$t('Dump in one shot payload')"
            @click="applyFunction('Payload.SQLi.MySQL.dumpInOneShot', true)"
          />
          <VListItem
            :title="$t('Union select statement')"
            @click="
              openSqlInjectionPrompt('Payload.SQLi.MySQL.unionSelect', false)
            "
          />
          <VListItem
            :title="$t('Error-based injection statement')"
            @click="applyFunction('Payload.SQLi.MySQL.errorBased', true)"
          />
        </VList>
      </VMenu>
      <VMenu location="end" open-on-hover>
        <template #activator="{ props }">
          <VListItem
            :append-icon="mdiChevronRight"
            title="PostgreSQL"
            v-bind="props"
            @click.stop
          />
        </template>
        <VList>
          <VListItem
            :title="$t('Dump all database names')"
            @click="
              openSqlInjectionPrompt('Payload.SQLi.PostgreSQL.dumpDatabases')
            "
          />
          <VListItem
            :title="$t('Dump tables from database')"
            @click="
              openSqlInjectionPrompt('Payload.SQLi.PostgreSQL.dumpTables')
            "
          />
          <VListItem
            :title="$t('Dump columns from database')"
            @click="
              openSqlInjectionPrompt('Payload.SQLi.PostgreSQL.dumpColumns')
            "
          />
          <VListItem
            :title="$t('Union select statement')"
            @click="
              openSqlInjectionPrompt(
                'Payload.SQLi.PostgreSQL.unionSelect',
                false,
              )
            "
          />
          <VListItem
            :title="$t('Error-based injection statement')"
            @click="applyFunction('Payload.SQLi.PostgreSQL.errorBased', true)"
          />
          <VListItem
            :title="$t('Command execution statement')"
            @click="applyFunction('Payload.SQLi.PostgreSQL.cmdExec', true)"
          />
        </VList>
      </VMenu>
      <VMenu location="end" open-on-hover>
        <template #activator="{ props }">
          <VListItem
            :append-icon="mdiChevronRight"
            title="SQLite"
            v-bind="props"
            @click.stop
          />
        </template>
        <VList>
          <VListItem
            :title="$t('Dump tables from database')"
            @click="openSqlInjectionPrompt('Payload.SQLi.SQLite.dumpTables')"
          />
          <VListItem
            :title="$t('Dump columns from database (also with table name)')"
            @click="openSqlInjectionPrompt('Payload.SQLi.SQLite.dumpColumns')"
          />
          <VListItem
            :title="$t('Union select statement')"
            @click="
              openSqlInjectionPrompt('Payload.SQLi.SQLite.unionSelect', false)
            "
          />
        </VList>
      </VMenu>
      <VMenu location="end" open-on-hover>
        <template #activator="{ props }">
          <VListItem
            :append-icon="mdiChevronRight"
            title="Microsoft SQL Server"
            v-bind="props"
            @click.stop
          />
        </template>
        <VList>
          <VListItem
            :title="$t('Dump all database names')"
            @click="openSqlInjectionPrompt('Payload.SQLi.MSSQL.dumpDatabases')"
          />
          <VListItem
            :title="$t('Dump tables from database')"
            @click="openSqlInjectionPrompt('Payload.SQLi.MSSQL.dumpTables')"
          />
          <VListItem
            :title="$t('Dump columns from database')"
            @click="openSqlInjectionPrompt('Payload.SQLi.MSSQL.dumpColumns')"
          />
          <VListItem
            :title="$t('Union select statement')"
            @click="
              openSqlInjectionPrompt('Payload.SQLi.MSSQL.unionSelect', false)
            "
          />
          <VListItem
            :title="$t('Error-based injection statement')"
            @click="applyFunction('Payload.SQLi.MSSQL.errorBased', true)"
          />
          <VListItem
            :title="$t('Command execution statement')"
            @click="applyFunction('Payload.SQLi.MSSQL.cmdExec', true)"
          />
        </VList>
      </VMenu>
      <VListItem
        :title="$t('Polyglot')"
        @click="applyFunction('Payload.SQLi.polyglot', true)"
      />
      <VListItem
        :title="$t('Space to Inline comment')"
        @click="applyFunction('Payload.SQLi.spaceToComment')"
      />
    </VList>
  </VMenu>
</template>

<script lang="ts">
import { mdiChevronRight } from '@mdi/js'
import { defineComponent, inject } from 'vue'
import { ApplyFunctionKey, OpenSqlInjectionPromptKey } from '@/app/context'

export default defineComponent({
  name: 'SqlInjectionMenu',
  setup() {
    const applyFunction = inject(ApplyFunctionKey)!
    const openSqlInjectionPrompt = inject(OpenSqlInjectionPromptKey)!

    return {
      mdiChevronRight,

      applyFunction,
      openSqlInjectionPrompt,
    }
  },
})
</script>
