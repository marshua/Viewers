import { Template } from 'meteor/templating';
import { Session } from 'meteor/session';
import { OHIF } from 'meteor/ohif:core';

Session.set('TimepointsReady', false);
Session.set('MeasurementsReady', false);

Template.viewer.onCreated(() => {
    ViewerData = window.ViewerData || ViewerData;

    const instance = Template.instance();

    ValidationErrors.remove({});

    instance.data.state = new ReactiveDict();
    instance.data.state.set('leftSidebar', Session.get('leftSidebar'));
    instance.data.state.set('rightSidebar', Session.get('rightSidebar'));

    const contentId = instance.data.contentId;

    OHIF.viewer.functionList = $.extend(OHIF.viewer.functionList, {
        toggleLesionTrackerTools: OHIF.lesiontracker.toggleLesionTrackerTools,
        clearTools: clearTools,
        bidirectional: () => {
            // Used for hotkeys
            toolManager.setActiveTool('bidirectional');
        },
        nonTarget: () => {
            // Used for hotkeys
            toolManager.setActiveTool('nonTarget');
        }
    });

    if (ViewerData[contentId].loadedSeriesData) {
        OHIF.log.info('Reloading previous loadedSeriesData');
        OHIF.viewer.loadedSeriesData = ViewerData[contentId].loadedSeriesData;

    } else {
        OHIF.log.info('Setting default ViewerData');
        OHIF.viewer.loadedSeriesData = {};
        ViewerData[contentId].loadedSeriesData = {};
        Session.set('ViewerData', ViewerData);
    }

    Session.set('activeViewport', ViewerData[contentId].activeViewport || false);

    // Set lesion tool buttons as disabled if pixel spacing is not available for active element
    instance.autorun(OHIF.lesiontracker.pixelSpacingAutorunCheck);

    // Update the ViewerStudies collection with the loaded studies
    ViewerStudies.remove({});

    instance.data.studies.forEach(study => {
        study.selected = true;
        study.displaySets = createStacks(study);
        ViewerStudies.insert(study);
    });

    instance.data.timepointApi = new OHIF.measurements.TimepointApi(instance.data.currentTimepointId);

    const patientId = instance.data.studies[0].patientId;
    const filter = {
        patientId
    };

    const timepointsPromise = instance.data.timepointApi.retrieveTimepoints(filter);
    timepointsPromise.then(() => {
        const timepoints = instance.data.timepointApi.all();

        //  Set timepointType in studies to be used in hanging protocol engine
        timepoints.forEach(function(timepoint) {
            timepoint.studyInstanceUids.forEach(function(studyInstanceUid) {
                const study = _.find(instance.data.studies, function (element) {
                    return element.studyInstanceUid === studyInstanceUid;
                });
                if (!study) {
                    return;
                }

                study.timepointType = timepoint.timepointType;
            });
        });

        Session.set('TimepointsReady', true);
    });

    instance.data.measurementApi = new OHIF.measurements.MeasurementApi(instance.data.currentTimepointId);
    const measurementsPromise = instance.data.measurementApi.retrieveMeasurements(filter);
    measurementsPromise.then(() => {
        Session.set('MeasurementsReady', true);

        console.warn('>>>>SYNC CALLED');
        instance.data.measurementApi.syncMeasurementsAndToolData();
    });

    // Provide the necessary data to the Measurement API and Timepoint API
    const prior = instance.data.timepointApi.prior();
    if (prior) {
        instance.data.measurementApi.priorTimepointId = prior.timepointId;
    }

    if (instance.data.currentTimepointId) {
        //  Enable Lesion Tracker Tools if the opened study is associated
        OHIF.lesiontracker.toggleLesionTrackerToolsButtons(true);
    } else {
        //  Disable Lesion Tracker Tools if the opened study is not associated
        OHIF.lesiontracker.toggleLesionTrackerToolsButtons(false);
    }
});

Template.viewer.helpers({
    dataSourcesReady() {
        // TODO: Find a better way to do this
        return Session.get('TimepointsReady') && Session.get('MeasurementsReady');
    }
});

Template.viewer.events({
    'CornerstoneToolsMeasurementAdded .imageViewerViewport'(event, instance, eventData) {
        OHIF.measurements.MeasurementHandlers.onAdded(event, instance, eventData);
    },
    'CornerstoneToolsMeasurementModified .imageViewerViewport'(event, instance, eventData) {
        OHIF.measurements.MeasurementHandlers.onModified(event, instance, eventData);
    },
    'CornerstoneToolsMeasurementRemoved .imageViewerViewport'(event, instance, eventData) {
        OHIF.measurements.MeasurementHandlers.onRemoved(event, instance, eventData);
    }
});