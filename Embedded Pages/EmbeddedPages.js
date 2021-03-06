tau.mashups
    .addDependency('jQuery')
    .addDependency('Underscore')
    .addDependency('tp/general/view')
    .addDependency('tp3/mashups/storage')
    .addDependency('EmbeddedPages.config')
    .addCSS('EmbeddedPages.css')
    .addMashup(function ($, _, generalView, Storage, EmbeddedPagesConfig) {
        var EmbeddedPages = function () {
            _.forEach(EmbeddedPagesConfig.tabs, _.bind(this._addTab, this));
        };

        EmbeddedPages.prototype = {
            URL_CF_TYPES: {
                URL: 'url',
                TEMPLATED_URL: 'templatedurl'
            },
            CF_HOLDER_ENTITY_TYPES: ['bug', 'build', 'feature', 'impediment', 'iteration', 'project', 'release', 'request', 'task', 'testcase', 'testplan', 'testplanrun', 'time', 'userstory'],
            REQUEST_FIELDS_FOR_PROJECT: ['customFields', {
                process: ['name', {
                    customFields: ['name', 'value', {
                        entityType: ['name']}]
                }]
            }],
            REQUEST_FIELDS_FOR_CF_HOLDER: ['customFields', {
                project: [{
                    process: ['name', {
                        customFields: ['name', 'value', {
                            entityType: ['name']}]
                    }]
                }]
            }],
            REQUEST_FIELDS_FOR_DEFAULT_PROCESS: ['name', {
                        customFields: ['name', 'value', {
                            entityType: ['name']
                         }]
            }],
            $FRAME_TEMPLATE: '<iframe class="embedded-pages-tab-frame" src="${url}"></iframe>',
            $EMPTY_TEMPLATE: '<span class="embedded-pages-tab-empty">Nothing to display in the Tab: the value of the \'${customFieldName}\' Custom Field is empty</span>',
            _addTab: function (tabConfig) {
                generalView.addTab(
                    tabConfig.customFieldName,
                    _.bind(this._tabContentIsRenderedHandler, this, tabConfig),
                    $.noop,
                    {
                        getViewIsSuitablePromiseCallback: _.bind(this._getViewIsSuitablePromise, this, tabConfig)
                    });
            },
            _tabContentIsRenderedHandler: function (tabConfig, contentElement, context) {
                this._getContextEntityPromise(context).done(_.bind(function(entity){
                    this._getProcessWithCFDefinitionsPromise(entity).done(
                        _.bind(this._buildTab, this, tabConfig, contentElement, entity)
                    )
                }, this)
                );
            },
            _getContextEntityPromise: function(context){
                var contextEntityDeferred = $.Deferred();
                var entityTypeName = context.entity.type || context.entity.entityType.name;
                (new Storage())
                    .getEntity()
                        .ofType(entityTypeName)
                        .withId(context.entity.id)
                        .withFieldSetRestrictedTo(this._getFieldSetRequiredByEntityType(entityTypeName))
                        .withCallOnDone(contextEntityDeferred.resolve)
                        .withCallOnFail(contextEntityDeferred.reject)
                    .execute();
                return contextEntityDeferred.promise();
            },
            _getFieldSetRequiredByEntityType: function(entityTypeName){
                return entityTypeName.toLowerCase() === 'project'
                ? this.REQUEST_FIELDS_FOR_PROJECT
                : this.REQUEST_FIELDS_FOR_CF_HOLDER;
            },
            _getProcessWithCFDefinitionsPromise: function(entity){
                var cfDefinitionsDeferred = $.Deferred();
                if (entity.project){
                    cfDefinitionsDeferred.resolve(entity.project.process);
                } else {
                    (new Storage())
                        .getEntities()
                            .ofType('process')
                            .filteredBy({isDefault: 'true'})
                            .withFieldSetRestrictedTo(this.REQUEST_FIELDS_FOR_DEFAULT_PROCESS)
                            .withCallOnDone(function(processes){
                                var defaultProcess = processes[0];
                                cfDefinitionsDeferred.resolve(defaultProcess);
                            })
                            .withCallOnFail(cfDefinitionsDeferred.reject)
                        .execute();
                }
                return cfDefinitionsDeferred.promise();
            },
            _buildTab: function (tabConfig, contentElement, entity, process) {
                var cfDefinitions = process.customFields;
                var tabCF = this._getTabCF(tabConfig, entity.customFields);
                if (!tabCF) {
                    return;
                }
                if (!tabCF.value){
                    this._appendEmptyToTabContent($(contentElement), tabConfig.customFieldName)
                    return;
                }
                var entityCFDefinition = this._getEntityCFDefinition(tabConfig, cfDefinitions);
                var tabFrameUrl = this._getUrl(tabCF, entityCFDefinition);
                if (!tabFrameUrl) {
                    return;
                }
                this._appendFrameToTabContent($(contentElement), tabFrameUrl);
            },
            _getTabCF: function(tabConfig, customFields){
                return _.find(customFields, _.bind(function (cf) {
                    return tabConfig.customFieldName.toLowerCase() === cf.name.toLowerCase()
                        && _.contains(_.values(this.URL_CF_TYPES), cf.type.toLowerCase());
                }, this));
            },
            _getEntityCFDefinition: function(tabConfig, cfDefinitions){
                return _.find(cfDefinitions, function(cfDefinition){
                    return tabConfig.customFieldName.toLowerCase() === cfDefinition.name.toLowerCase()
                        && tabConfig.entityTypeName.toLowerCase() === cfDefinition.entityType.name.toLowerCase();
                });
            },
            _getUrl: function(tabCF, entityCFDefinition){
                var tabFrameUrl;
                switch (tabCF.type.toLowerCase()) {
                    case this.URL_CF_TYPES.URL:
                        tabFrameUrl = tabCF.value.url;
                        break;
                    case this.URL_CF_TYPES.TEMPLATED_URL:
                        if (!entityCFDefinition){
                            break;
                        }
                        tabFrameUrl = entityCFDefinition.value.replace(/\{0\}/, tabCF.value);
                        break;
                }

                return tabFrameUrl;
            },
            _appendFrameToTabContent: function($contentElement, tabFrameUrl){
                $.tmpl(this.$FRAME_TEMPLATE, {url: tabFrameUrl}).appendTo($contentElement);
            },
            _appendEmptyToTabContent: function($contentElement, customFieldName){
                $.tmpl(this.$EMPTY_TEMPLATE, {customFieldName: customFieldName}).appendTo($contentElement);
            },
            _getViewIsSuitablePromise: function(tabConfig, viewContext){
                var viewIsSuitableDeferred = $.Deferred();
                if (!this._isViewSuitableByEntity(tabConfig, viewContext.entity)){
                    viewIsSuitableDeferred.resolve(false);
                } else {
                    this._getContextEntityPromise(viewContext)
                        .done(_.bind(function(entity){
                            this._getProcessWithCFDefinitionsPromise(entity)
                                .done(_.bind(function(process){
                                    var viewIsSuitable = this._isViewSuitableByProcess(tabConfig, process);
                                    viewIsSuitableDeferred.resolve(viewIsSuitable);
                                }, this))
                                .fail(function(failData){
                                    viewIsSuitableDeferred.reject(failData)
                                });

                        }, this))
                        .fail(function(failData){
                            viewIsSuitableDeferred.reject(failData)
                        });
                }
                return viewIsSuitableDeferred.promise();
            },
            _isViewSuitableByEntity: function(tabConfig, entity){
                var entityTypeNameLowered = entity.entityType.name.toLowerCase();
                return tabConfig.entityTypeName
                    && tabConfig.entityTypeName.toLowerCase() === entityTypeNameLowered
                    && _.contains(this.CF_HOLDER_ENTITY_TYPES, entityTypeNameLowered);
            },
            _isViewSuitableByProcess: function(tabConfig, process){
                return !tabConfig.processName
                    || (process
                        && tabConfig.processName.toLowerCase() === process.name.toLowerCase()
                        && _.find(process.customFields, function (cfDefinition) {
                            return tabConfig.customFieldName.toLowerCase() === cfDefinition.name.toLowerCase()
                                && tabConfig.entityTypeName.toLowerCase() === cfDefinition.entityType.name.toLowerCase();
                        })
                    );
            }
        };

        new EmbeddedPages();
    });